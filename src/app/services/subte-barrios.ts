import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, Observable, shareReplay } from 'rxjs';
import type { FeatureCollection, Geometry, MultiPolygon, Point, Polygon } from 'geojson';
import * as turf from '@turf/turf';

export interface BarrioProperties {
  nombre: string;
  comuna: number;
}

export interface LineaProperties {
  nombre: string;
}

export interface EstacionProperties {
  estacion: string;
  linea: string;
}

/** Color oficial de cada línea, compartido por el mapa y las secciones de aprendizaje */
export const LINE_COLORS: Readonly<Record<string, string>> = {
  A: '#00AEEF',
  B: '#E4032E',
  C: '#00397A',
  D: '#008C5A',
  E: '#872B90',
  H: '#F2C200',
};

export type BarriosGeoJSON = FeatureCollection<Polygon | MultiPolygon, BarrioProperties>;
export type LineasGeoJSON = FeatureCollection<Geometry, LineaProperties>;
export type EstacionesGeoJSON = FeatureCollection<Point, EstacionProperties>;

export interface LineaConBarrios {
  linea: string;
  barrios: string[];
}

/** Otra estación, de otra línea, a poca distancia caminando (ver RADIO_COMBINACION_METROS) */
export interface EstacionCercana {
  nombre: string;
  linea: string;
}

export interface EstacionInfo {
  nombre: string;
  linea: string;
  barrio: string | null;
  combinaciones: EstacionCercana[];
}

/** Extrae el identificador de línea ("A", "B", ...) de un nombre tipo "Linea A" */
export function extraerLineaId(nombreCompleto: string | undefined): string {
  return (nombreCompleto ?? '').replace(/linea/i, '').trim();
}

/** Dos estaciones de líneas distintas a esta distancia o menos se consideran "cercanas para
 * combinar" (a pie). No es una lista oficial de combinaciones: se infiere de la geografía real,
 * porque el dataset nombra distinto la misma estación física según la línea (ej. "Diagonal
 * Norte" en la C es la "Carlos Pellegrini" de la B). */
const RADIO_COMBINACION_METROS = 200;

@Injectable({ providedIn: 'root' })
export class SubteBarriosService {
  private readonly http = inject(HttpClient);

  /** Cacheados con shareReplay: un único fetch por archivo, reusado por todos los consumidores */
  private readonly barrios$: Observable<BarriosGeoJSON> = this.http
    .get<BarriosGeoJSON>('/barrios.geojson')
    .pipe(shareReplay(1));

  private readonly lineas$: Observable<LineasGeoJSON> = this.http
    .get<LineasGeoJSON>('/subte-lineas.geojson')
    .pipe(shareReplay(1));

  private readonly estaciones$: Observable<EstacionesGeoJSON> = this.http
    .get<EstacionesGeoJSON>('/subte-estaciones.geojson')
    .pipe(shareReplay(1));

  /** Geojson crudo de barrios, para dibujar el polígono de cada barrio */
  getBarrios(): Observable<BarriosGeoJSON> {
    return this.barrios$;
  }

  /** Geojson crudo de líneas, para dibujar el trazado real de las vías */
  getLineas(): Observable<LineasGeoJSON> {
    return this.lineas$;
  }

  /** Geojson crudo de estaciones (paradas), para marcarlas sobre el recorrido */
  getEstaciones(): Observable<EstacionesGeoJSON> {
    return this.estaciones$;
  }

  /**
   * Una entrada por estación con nombre propio (mismo universo que subte-estaciones.geojson),
   * enriquecida con el barrio que la contiene (por intersección geográfica real) y las
   * estaciones de otra línea a poca distancia caminando.
   */
  private readonly estacionesInfo$: Observable<EstacionInfo[]> = forkJoin({
    estaciones: this.estaciones$,
    barrios: this.barrios$,
  }).pipe(
    map(({ estaciones, barrios }) => {
      const infos: EstacionInfo[] = estaciones.features.map((feature) => ({
        nombre: feature.properties.estacion,
        linea: feature.properties.linea,
        barrio: this.barrioDePunto(feature.geometry.coordinates, barrios),
        combinaciones: [],
      }));

      for (let i = 0; i < estaciones.features.length; i++) {
        for (let j = i + 1; j < estaciones.features.length; j++) {
          if (infos[i].linea === infos[j].linea) continue;

          const distanciaKm = turf.distance(
            estaciones.features[i].geometry.coordinates,
            estaciones.features[j].geometry.coordinates,
          );
          if (distanciaKm * 1000 > RADIO_COMBINACION_METROS) continue;

          infos[i].combinaciones.push({ nombre: infos[j].nombre, linea: infos[j].linea });
          infos[j].combinaciones.push({ nombre: infos[i].nombre, linea: infos[i].linea });
        }
      }

      return infos;
    }),
    shareReplay(1),
  );

  getEstacionesInfo(): Observable<EstacionInfo[]> {
    return this.estacionesInfo$;
  }

  private barrioDePunto(coordenadas: number[], barrios: BarriosGeoJSON): string | null {
    const punto = turf.point(coordenadas);
    const barrio = barrios.features.find((feature) => turf.booleanPointInPolygon(punto, feature));
    return barrio?.properties.nombre ?? null;
  }

  /** Mapa barrio -> líneas que lo cruzan, calculado por intersección geográfica */
  getBarrioLineasMap(): Observable<Map<string, string[]>> {
    return forkJoin({ barrios: this.barrios$, lineas: this.lineas$ }).pipe(
      map(({ barrios, lineas }) => {
        const resultado = new Map<string, string[]>();

        for (const barrioFeature of barrios.features) {
          const nombreBarrio = barrioFeature.properties.nombre;
          const lineasQueCruzan = new Set<string>();

          for (const lineaFeature of lineas.features) {
            const lineaId = extraerLineaId(lineaFeature.properties.nombre);
            if (!lineaId) continue;

            try {
              if (turf.booleanIntersects(barrioFeature, lineaFeature)) {
                lineasQueCruzan.add(lineaId);
              }
            } catch (err) {
              console.warn(`Error comparando ${nombreBarrio} con línea ${lineaId}`, err);
            }
          }

          if (lineasQueCruzan.size > 0) {
            resultado.set(nombreBarrio, Array.from(lineasQueCruzan));
          }
        }

        return resultado;
      }),
    );
  }

  /**
   * Invierte el mapa barrio->lineas para tener linea->barrios,
   * ordenado y listo para mostrar en un listado.
   */
  invertirALineaConBarrios(barrioLineasMap: Map<string, string[]>): LineaConBarrios[] {
    const porLinea = new Map<string, Set<string>>();

    for (const [barrio, lineas] of barrioLineasMap.entries()) {
      for (const linea of lineas) {
        const barriosDeLinea = porLinea.get(linea) ?? new Set<string>();
        barriosDeLinea.add(barrio);
        porLinea.set(linea, barriosDeLinea);
      }
    }

    return Array.from(porLinea.entries())
      .map(([linea, barrios]) => ({
        linea,
        barrios: Array.from(barrios).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.linea.localeCompare(b.linea));
  }
}
