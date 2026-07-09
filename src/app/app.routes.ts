import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'mapa' },
  { path: 'mapa', loadComponent: () => import('./map/map').then((m) => m.MapComponent) },
  {
    path: 'memorizar',
    loadComponent: () => import('./aprender/memorizar/memorizar').then((m) => m.MemorizarComponent),
  },
  { path: 'quiz', loadComponent: () => import('./aprender/quiz/quiz').then((m) => m.QuizComponent) },
  { path: 'donde', loadComponent: () => import('./aprender/donde/donde').then((m) => m.DondeComponent) },
  { path: '**', redirectTo: 'mapa' },
];
