/**
 * The browser tab's title for a route. Every page used to be "TigerWorkouts", so a shared workout,
 * a second tab and the browser's history all read the same.
 */
const APP = 'TigerWorkouts';

export const pageTitle = (route: { name: string; tab?: string; id?: string }, names: { workout: (id: string) => string | undefined; exercise: (key: string) => string | undefined; session: (id: string) => string | undefined }): string => {
  const of = (s: string | undefined) => (s?.trim() ? `${s.trim()} · ${APP}` : APP);
  switch (route.name) {
    case 'tab':
      return route.tab === 'history' ? of('History') : route.tab === 'me' ? of('Me') : APP;
    case 'workout':
    case 'do':
    case 'result':
    case 'follow':
      return of(route.id && names.workout(route.id));
    case 'session':
      return of(route.id && names.session(route.id));
    case 'exercise':
      return of(route.id && names.exercise(route.id));
    case 'weeks':
      return of('Week by week');
    case 'new':
      return of('New workout');
    case 'coach':
      return of('Coaching');
    case 'coaches':
      return of('For coaches');
    case 'join':
      return of('Coach invite');
    case 'import':
      return of('Shared workout');
    default:
      return APP;
  }
};
