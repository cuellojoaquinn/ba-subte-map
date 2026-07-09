import { Injectable, signal } from '@angular/core';

export interface EstadisticasQuiz {
  correctas: number;
  total: number;
  racha: number;
  mejorRacha: number;
}

interface ProgresoGuardado {
  vistas: string[];
  quiz: EstadisticasQuiz;
}

const CLAVE_STORAGE = 'subte-progreso';

const ESTADISTICAS_INICIALES: EstadisticasQuiz = { correctas: 0, total: 0, racha: 0, mejorRacha: 0 };

/** Persiste en localStorage qué estaciones ya se vieron y las estadísticas del quiz */
@Injectable({ providedIn: 'root' })
export class ProgresoService {
  private readonly vistas = signal<ReadonlySet<string>>(new Set());
  private readonly quiz = signal<EstadisticasQuiz>(ESTADISTICAS_INICIALES);

  readonly estacionesVistas = this.vistas.asReadonly();
  readonly estadisticasQuiz = this.quiz.asReadonly();

  constructor() {
    this.cargar();
  }

  haVisto(clave: string): boolean {
    return this.vistas().has(clave);
  }

  marcarVista(clave: string): void {
    if (this.vistas().has(clave)) return;
    this.vistas.update((actuales) => new Set(actuales).add(clave));
    this.guardar();
  }

  reiniciar(): void {
    this.vistas.set(new Set());
    this.quiz.set(ESTADISTICAS_INICIALES);
    this.guardar();
  }

  registrarRespuestaQuiz(correcta: boolean): void {
    this.quiz.update((actual) => {
      const racha = correcta ? actual.racha + 1 : 0;
      return {
        correctas: actual.correctas + (correcta ? 1 : 0),
        total: actual.total + 1,
        racha,
        mejorRacha: Math.max(actual.mejorRacha, racha),
      };
    });
    this.guardar();
  }

  private cargar(): void {
    try {
      const guardado = localStorage.getItem(CLAVE_STORAGE);
      if (!guardado) return;

      const datos: ProgresoGuardado = JSON.parse(guardado);
      this.vistas.set(new Set(datos.vistas));
      this.quiz.set(datos.quiz);
    } catch (err) {
      console.warn('No se pudo leer el progreso guardado', err);
    }
  }

  private guardar(): void {
    const datos: ProgresoGuardado = { vistas: Array.from(this.vistas()), quiz: this.quiz() };
    try {
      localStorage.setItem(CLAVE_STORAGE, JSON.stringify(datos));
    } catch (err) {
      console.warn('No se pudo guardar el progreso', err);
    }
  }
}
