import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Layout } from './Layout';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { QuoteEditorPage } from './features/editor/QuoteEditorPage';
import { OfferPage } from './features/offer/OfferPage';
import { QuotesListPage } from './features/quotes/QuotesListPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ConfirmProvider } from './shared/confirm';
import { ToastProvider } from './shared/feedback';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'quotes', element: <QuotesListPage /> },
      { path: 'quotes/new', element: <QuoteEditorPage /> },
      { path: 'quotes/:id', element: <QuoteEditorPage /> },
      { path: 'quotes/:id/offer', element: <OfferPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
