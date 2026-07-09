import { Component, AfterViewInit, OnDestroy, inject, signal } from '@angular/core';
import * as L from 'leaflet';
import {
  SubteBarriosService,
  LineaConBarrios,
  LINE_COLORS,
  BarrioProperties,
  BarriosGeoJSON,
  EstacionProperties,
  EstacionesGeoJSON,
  LineaProperties,
  LineasGeoJSON,
  extraerLineaId,
} from '../services/subte-barrios';

const COLOR_LINEA_DESCONOCIDA = '#000';
const COLOR_BARRIO_SIN_LINEA = '#c7c7c7';

/** Relleno de barrio: bien tenue, para que nunca compita con el trazado de las líneas */
const BARRIO_FILL_OPACITY = 0.1;
const BARRIO_FILL_OPACITY_HOVER = 0.38;

/** Color del "casing" (contorno oscuro) que se dibuja debajo de cada línea */
const LINEA_CASING_COLOR = 'rgba(20, 20, 35, 0.4)';

const LIMITES_CABA = L.latLngBounds(L.latLng(-34.705, -58.531), L.latLng(-34.526, -58.335));

/** A partir de este zoom el nombre de cada estación queda visible sin necesidad de hover */
const ZOOM_MOSTRAR_NOMBRES_ESTACION = 15;

/** Dos features con el mismo nombre a menos de esta distancia son la misma estación física */
const RADIO_AGRUPACION_ESTACION_METROS = 250;

interface EstacionAgrupada {
  nombre: string;
  latlng: L.LatLng;
  lineas: string[];
}

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private readonly subteBarrios = inject(SubteBarriosService);
  private map!: L.Map;

  // Grupos vacíos agregados al mapa en este orden fijo desde el arranque: así, sea cual sea
  // el archivo que termine de cargar primero, las líneas y estaciones SIEMPRE quedan
  // visualmente arriba de los barrios (antes dependía de una carrera entre fetches).
  private capaBarrios!: L.LayerGroup;
  private capaLineas!: L.LayerGroup;
  private capaEstaciones!: L.LayerGroup;

  readonly lineColors = LINE_COLORS;
  readonly lineasConBarrios = signal<LineaConBarrios[]>([]);
  readonly lineasResaltadas = signal<ReadonlySet<string>>(new Set());

  ngAfterViewInit(): void {
    this.initMap();

    this.subteBarrios.getBarrioLineasMap().subscribe({
      next: (barrioLineasMap) => {
        this.lineasConBarrios.set(this.subteBarrios.invertirALineaConBarrios(barrioLineasMap));
        this.dibujarBarrios(barrioLineasMap);
      },
      error: (err) => console.error('No se pudo calcular la relación barrios/líneas', err),
    });

    this.dibujarLineasReales();
    this.dibujarEstaciones();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private initMap(): void {
    this.map = L.map('map', {
      center: [-34.6118, -58.4173],
      zoom: 12,
      minZoom: 11,
      maxZoom: 18,
      maxBounds: LIMITES_CABA.pad(0.05),
      maxBoundsViscosity: 1,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    this.map.fitBounds(LIMITES_CABA);

    // Orden de agregado = orden de apilado en Leaflet: barrios abajo, líneas en medio,
    // estaciones arriba. Quedan vacíos hasta que cada fetch resuelve.
    this.capaBarrios = L.layerGroup().addTo(this.map);
    this.capaLineas = L.layerGroup().addTo(this.map);
    this.capaEstaciones = L.layerGroup().addTo(this.map);

    // Los controles de dibujo de leaflet-geoman se quitaron: no aportaban a esta experiencia
    // de exploración y sumaban ruido visual sobre el mapa. Si en algún momento hacen falta,
    // reinstalar '@geoman-io/leaflet-geoman-free' y llamar this.map.pm.addControls(...) de nuevo.
  }

  /** Promedia colores hex — para el relleno de un barrio cruzado por más de una línea */
  private mezclarColores(hexColors: string[]): string {
    const rgbs = hexColors.map((hex) => {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    });
    const avg = [0, 1, 2].map((i) => Math.round(rgbs.reduce((s, c) => s + c[i], 0) / rgbs.length));
    return `rgb(${avg[0]}, ${avg[1]}, ${avg[2]})`;
  }

  private colorDeBarrio(lineas: string[]): string {
    if (lineas.length === 0) return COLOR_BARRIO_SIN_LINEA;
    if (lineas.length === 1) return this.lineColors[lineas[0]];
    return this.mezclarColores(lineas.map((l) => this.lineColors[l]));
  }

  private dibujarBarrios(barrioLineasMap: Map<string, string[]>): void {
    this.subteBarrios.getBarrios().subscribe({
      next: (geojson) => this.renderBarrios(geojson, barrioLineasMap),
      error: (err) => console.error('No se pudo cargar barrios.geojson', err),
    });
  }

  private renderBarrios(geojson: BarriosGeoJSON, barrioLineasMap: Map<string, string[]>): void {
    const barriosLayer = L.geoJSON<BarrioProperties>(geojson, {
      style: (feature) => {
        const nombre = feature?.properties.nombre ?? '';
        const lineas = barrioLineasMap.get(nombre) ?? [];
        const color = this.colorDeBarrio(lineas);

        return {
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: lineas.length ? BARRIO_FILL_OPACITY : 0.03,
          opacity: 0.6,
        };
      },
      onEachFeature: (feature, layer) => {
        const nombre = feature.properties.nombre;
        const lineas = barrioLineasMap.get(nombre) ?? [];
        const dots = lineas
          .map((l) => `<span class="barrio-tooltip__dot" style="background:${this.lineColors[l]}"></span>`)
          .join('');
        layer.bindTooltip(
          `<div class="barrio-tooltip__nombre">${nombre}</div>` +
            `<div class="barrio-tooltip__lineas">${dots || '<span class="barrio-tooltip__vacio">sin línea</span>'}</div>`,
          { sticky: true, className: 'barrio-tooltip' },
        );

        const barrioPath = layer as L.Path;
        barrioPath.on('mouseover', () => {
          barrioPath.setStyle({ weight: 2.5, fillOpacity: BARRIO_FILL_OPACITY_HOVER });
          // A propósito NO se llama bringToFront(): el orden de capas fijo ya garantiza
          // que las líneas y estaciones queden siempre por encima del barrio.
          this.lineasResaltadas.set(new Set(lineas));
        });
        barrioPath.on('mouseout', () => {
          barriosLayer.resetStyle(barrioPath);
          this.lineasResaltadas.set(new Set());
        });
      },
    });

    barriosLayer.addTo(this.capaBarrios);
  }

  /** Dibuja el trazado real de las vías, con el color oficial de cada línea + un casing oscuro */
  private dibujarLineasReales(): void {
    this.subteBarrios.getLineas().subscribe({
      next: (geojson) => this.renderLineas(geojson),
      error: (err) => console.error('No se pudo cargar subte-lineas.geojson', err),
    });
  }

  private renderLineas(geojson: LineasGeoJSON): void {
    // Casing: una línea oscura y más gruesa debajo del color oficial — le da profundidad
    // al trazado y es lo que hace que la línea H (amarilla) no se pierda sobre el mapa claro.
    L.geoJSON<LineaProperties>(geojson, {
      style: () => ({ color: LINEA_CASING_COLOR, weight: 7, opacity: 1 }),
    }).addTo(this.capaLineas);

    L.geoJSON<LineaProperties>(geojson, {
      style: (feature) => {
        const lineaId = extraerLineaId(feature?.properties.nombre);
        return {
          color: this.lineColors[lineaId] ?? COLOR_LINEA_DESCONOCIDA,
          weight: 4,
          opacity: 0.95,
        };
      },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(`<b>${feature.properties.nombre}</b>`);
      },
    }).addTo(this.capaLineas);
  }

  /** Marca cada estación (parada) sobre el recorrido, coloreada según su línea */
  private dibujarEstaciones(): void {
    this.subteBarrios.getEstaciones().subscribe({
      next: (geojson) => this.renderEstaciones(geojson),
      error: (err) => console.error('No se pudo cargar subte-estaciones.geojson', err),
    });
  }

  /** Agrupa features de estación por nombre + cercanía real (en metros): una estación de
   *  trasbordo (ej. Retiro, C+E) llega como 2-3 features a pocos metros una de otra — sin
   *  agrupar, se dibujan 2-3 etiquetas apiladas con el mismo nombre. Agrupar por distancia
   *  real (en vez de redondear lat/lng a un string) evita perder combinaciones que caen
   *  justo en el borde de esa grilla. */
  private agruparEstaciones(geojson: EstacionesGeoJSON): EstacionAgrupada[] {
    const gruposPorNombre = new Map<string, EstacionAgrupada[]>();

    for (const feature of geojson.features) {
      const [lng, lat] = feature.geometry.coordinates;
      const { estacion: nombre, linea } = feature.properties;
      const latlng = L.latLng(lat, lng);

      const gruposDelNombre = gruposPorNombre.get(nombre) ?? [];
      const grupoCercano = gruposDelNombre.find(
        (g) => g.latlng.distanceTo(latlng) <= RADIO_AGRUPACION_ESTACION_METROS,
      );

      if (grupoCercano) {
        grupoCercano.lineas.push(linea);
      } else {
        gruposDelNombre.push({ nombre, latlng, lineas: [linea] });
        gruposPorNombre.set(nombre, gruposDelNombre);
      }
    }

    return Array.from(gruposPorNombre.values()).flat();
  }

  private renderEstaciones(geojson: EstacionesGeoJSON): void {
    const grupos = this.agruparEstaciones(geojson);
    const marcadoresConTooltip: L.CircleMarker[] = [];

    for (const grupo of grupos) {
      const lineasUnicas = Array.from(new Set(grupo.lineas));
      const esCombinacion = lineasUnicas.length > 1;

      if (esCombinacion) {
        // Mini-clúster: un punto por línea, levemente separados, en vez de superponer
        // círculos idénticos en el mismo lugar.
        lineasUnicas.forEach((linea, i) => {
          const offset = (i - (lineasUnicas.length - 1) / 2) * 0.00018;
          L.circleMarker([grupo.latlng.lat + offset, grupo.latlng.lng + offset], {
            radius: 5,
            color: '#20202e',
            weight: 2,
            fillColor: this.lineColors[linea] ?? COLOR_LINEA_DESCONOCIDA,
            fillOpacity: 1,
          }).addTo(this.capaEstaciones);
        });
      } else {
        L.circleMarker([grupo.latlng.lat, grupo.latlng.lng], {
          radius: 5,
          color: '#20202e',
          weight: 2,
          fillColor: this.lineColors[lineasUnicas[0]] ?? COLOR_LINEA_DESCONOCIDA,
          fillOpacity: 1,
        }).addTo(this.capaEstaciones);
      }

      // Punto invisible que sólo lleva la etiqueta (una sola, aunque haya varias líneas).
      const ancla = L.circleMarker(grupo.latlng, { radius: 0.1, opacity: 0, fillOpacity: 0 }).addTo(
        this.capaEstaciones,
      );
      ancla.bindTooltip(grupo.nombre, {
        permanent: true,
        direction: 'right',
        offset: [9, 0],
        className: esCombinacion ? 'estacion-etiqueta estacion-etiqueta--combinacion' : 'estacion-etiqueta',
      });

      ancla.on('mouseover', () => {
        if (this.map.getZoom() < ZOOM_MOSTRAR_NOMBRES_ESTACION) ancla.openTooltip();
      });
      ancla.on('mouseout', () => {
        if (this.map.getZoom() < ZOOM_MOSTRAR_NOMBRES_ESTACION) ancla.closeTooltip();
      });
      marcadoresConTooltip.push(ancla);
    }

    const actualizarVisibilidadNombres = () => {
      const mostrar = this.map.getZoom() >= ZOOM_MOSTRAR_NOMBRES_ESTACION;
      for (const marcador of marcadoresConTooltip) {
        if (mostrar) marcador.openTooltip();
        else marcador.closeTooltip();
      }
    };

    actualizarVisibilidadNombres();
    this.map.on('zoomend', actualizarVisibilidadNombres);
  }
}
