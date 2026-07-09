import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { EstacionInfo, LINE_COLORS, SubteBarriosService } from '../../services/subte-barrios';
import { ProgresoService } from '../../services/progreso';

const LINEAS = ['A', 'B', 'C', 'D', 'E', 'H'];
const CANTIDAD_OPCIONES = 4;

type ModoPregunta = 'linea' | 'barrio';

interface Pregunta {
  estacion: EstacionInfo;
  modo: ModoPregunta;
  opciones: string[];
  correcta: string;
}

@Component({
  selector: 'app-quiz',
  standalone: true,
  templateUrl: './quiz.html',
  styleUrl: './quiz.scss',
})
export class QuizComponent implements OnInit {
  private readonly subteBarrios = inject(SubteBarriosService);
  private readonly progreso = inject(ProgresoService);

  private estaciones: EstacionInfo[] = [];
  private barrios: string[] = [];

  readonly lineColors = LINE_COLORS;
  readonly estadisticas = this.progreso.estadisticasQuiz;

  readonly cargando = signal(true);
  readonly numeroPregunta = signal(0);
  readonly pregunta = signal<Pregunta | null>(null);
  readonly opcionElegida = signal<string | null>(null);
  readonly respondida = signal(false);

  ngOnInit(): void {
    this.subteBarrios.getEstacionesInfo().subscribe({
      next: (estaciones) => {
        this.estaciones = estaciones;
        this.barrios = Array.from(
          new Set(estaciones.map((e) => e.barrio).filter((b): b is string => b !== null)),
        );
        this.cargando.set(false);
        this.nuevaPregunta();
      },
      error: (err) => {
        console.error('No se pudieron cargar las estaciones', err);
        this.cargando.set(false);
      },
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.respondida()) {
      const indiceOpcion = ['1', '2', '3', '4'].indexOf(event.key);
      const opciones = this.pregunta()?.opciones;
      if (indiceOpcion >= 0 && opciones?.[indiceOpcion] !== undefined) {
        this.responder(opciones[indiceOpcion]);
      }
    } else if (event.key === 'Enter') {
      this.nuevaPregunta();
    }
  }

  nuevaPregunta(): void {
    if (!this.estaciones.length) return;

    this.numeroPregunta.update((n) => n + 1);
    this.respondida.set(false);
    this.opcionElegida.set(null);

    const conBarrio = this.estaciones.filter((e) => e.barrio !== null);
    const modo: ModoPregunta = Math.random() < 0.5 || !conBarrio.length ? 'linea' : 'barrio';
    const pool = modo === 'barrio' ? conBarrio : this.estaciones;
    const estacion = pool[Math.floor(Math.random() * pool.length)];

    const correcta = modo === 'linea' ? estacion.linea : estacion.barrio!;
    const universo = modo === 'linea' ? LINEAS : this.barrios;
    const opciones = this.armarOpciones(universo, correcta);

    this.pregunta.set({ estacion, modo, opciones, correcta });
  }

  responder(opcion: string): void {
    if (this.respondida()) return;
    const pregunta = this.pregunta();
    if (!pregunta) return;

    this.opcionElegida.set(opcion);
    this.respondida.set(true);
    this.progreso.registrarRespuestaQuiz(opcion === pregunta.correcta);
  }

  esCorrecta(opcion: string): boolean {
    return opcion === this.pregunta()?.correcta;
  }

  private armarOpciones(universo: string[], correcta: string): string[] {
    const incorrectas = mezclar(universo.filter((v) => v !== correcta)).slice(0, CANTIDAD_OPCIONES - 1);
    return mezclar([correcta, ...incorrectas]);
  }
}

function mezclar<T>(items: T[]): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
