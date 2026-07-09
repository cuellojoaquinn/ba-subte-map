import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { EstacionInfo, LINE_COLORS, SubteBarriosService } from '../../services/subte-barrios';

@Component({
  selector: 'app-donde',
  standalone: true,
  templateUrl: './donde.html',
  styleUrl: './donde.scss',
})
export class DondeComponent implements OnInit {
  private readonly subteBarrios = inject(SubteBarriosService);

  readonly lineColors = LINE_COLORS;
  readonly cargando = signal(true);
  readonly estaciones = signal<EstacionInfo[]>([]);
  readonly barrioSeleccionado = signal('');
  readonly busqueda = signal('');

  readonly barrios = computed(() =>
    Array.from(new Set(this.estaciones().map((e) => e.barrio).filter((b): b is string => b !== null))).sort(
      (a, b) => a.localeCompare(b),
    ),
  );

  readonly estacionesDelBarrio = computed(() => {
    const barrio = this.barrioSeleccionado();
    return barrio ? this.estaciones().filter((e) => e.barrio === barrio) : [];
  });

  readonly resultadosBusqueda = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    if (texto.length < 2) return [];
    return this.estaciones().filter((e) => e.nombre.toLowerCase().includes(texto));
  });

  ngOnInit(): void {
    this.subteBarrios.getEstacionesInfo().subscribe({
      next: (estaciones) => {
        this.estaciones.set(estaciones);
        this.cargando.set(false);
      },
      error: (err) => {
        console.error('No se pudieron cargar las estaciones', err);
        this.cargando.set(false);
      },
    });
  }

  onBarrioChange(event: Event): void {
    this.barrioSeleccionado.set((event.target as HTMLSelectElement).value);
  }

  onBusquedaInput(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  limpiarBusqueda(input: HTMLInputElement): void {
    input.value = '';
    this.busqueda.set('');
  }

  /** Envuelve en <mark> la parte del nombre que matchea la búsqueda actual */
  resaltar(nombre: string): string {
    const texto = this.busqueda().trim();
    if (!texto) return nombre;

    const indice = nombre.toLowerCase().indexOf(texto.toLowerCase());
    if (indice === -1) return nombre;

    const inicio = nombre.slice(0, indice);
    const coincidencia = nombre.slice(indice, indice + texto.length);
    const resto = nombre.slice(indice + texto.length);
    return `${inicio}<mark>${coincidencia}</mark>${resto}`;
  }
}
