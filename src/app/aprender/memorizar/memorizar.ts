import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { EstacionInfo, LINE_COLORS, SubteBarriosService } from '../../services/subte-barrios';
import { ProgresoService } from '../../services/progreso';

const LINEAS = ['A', 'B', 'C', 'D', 'E', 'H'];

@Component({
  selector: 'app-memorizar',
  standalone: true,
  templateUrl: './memorizar.html',
  styleUrl: './memorizar.scss',
})
export class MemorizarComponent implements OnInit {
  private readonly subteBarrios = inject(SubteBarriosService);
  private readonly progreso = inject(ProgresoService);

  readonly lineas = LINEAS;
  readonly lineColors = LINE_COLORS;
  readonly estacionesVistas = this.progreso.estacionesVistas;

  readonly cargando = signal(true);
  readonly estaciones = signal<EstacionInfo[]>([]);
  readonly lineasActivas = signal<ReadonlySet<string>>(new Set(LINEAS));
  readonly indice = signal(0);
  readonly volteada = signal(false);

  readonly estacionesFiltradas = computed(() =>
    this.estaciones().filter((e) => this.lineasActivas().has(e.linea)),
  );

  readonly estacionActual = computed(() => {
    const lista = this.estacionesFiltradas();
    return lista.length ? lista[this.indice() % lista.length] : null;
  });

  readonly progresoPorcentaje = computed(() => {
    const total = this.estaciones().length;
    return total ? Math.round((this.estacionesVistas().size / total) * 100) : 0;
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

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') this.anterior();
    else if (event.key === 'ArrowRight') this.siguiente();
    else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.voltear();
    }
  }

  reiniciarProgreso(): void {
    const confirmado = confirm(
      '¿Reiniciar tu progreso guardado? Se perderán las estaciones vistas y las estadísticas del quiz.',
    );
    if (confirmado) this.progreso.reiniciar();
  }

  clave(estacion: EstacionInfo): string {
    return `${estacion.nombre}|${estacion.linea}`;
  }

  haVisto(estacion: EstacionInfo): boolean {
    return this.progreso.haVisto(this.clave(estacion));
  }

  toggleLinea(linea: string): void {
    this.lineasActivas.update((actuales) => {
      const nuevas = new Set(actuales);
      if (nuevas.has(linea)) nuevas.delete(linea);
      else nuevas.add(linea);
      // no dejar el filtro vacío: sin líneas activas no habría ninguna tarjeta que mostrar
      return nuevas.size ? nuevas : actuales;
    });
    this.indice.set(0);
    this.volteada.set(false);
  }

  voltear(): void {
    this.volteada.update((v) => !v);
    const estacion = this.estacionActual();
    if (this.volteada() && estacion) {
      this.progreso.marcarVista(this.clave(estacion));
    }
  }

  anterior(): void {
    const total = this.estacionesFiltradas().length;
    if (!total) return;
    this.indice.update((i) => (i - 1 + total) % total);
    this.volteada.set(false);
  }

  siguiente(): void {
    const total = this.estacionesFiltradas().length;
    if (!total) return;
    this.indice.update((i) => (i + 1) % total);
    this.volteada.set(false);
  }

  aleatoria(): void {
    const total = this.estacionesFiltradas().length;
    if (!total) return;
    this.indice.set(Math.floor(Math.random() * total));
    this.volteada.set(false);
  }
}
