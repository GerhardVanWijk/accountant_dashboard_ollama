import { RouterProvider, type createBrowserRouter } from 'react-router-dom';
import { AppProviders } from './providers';
import { router as browserRouter } from './router';

export interface AppProps {
  /** Injectable for tests (a createMemoryRouter). Defaults to the real browser router. */
  router?: ReturnType<typeof createBrowserRouter>;
}

export function App({ router = browserRouter }: AppProps) {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
