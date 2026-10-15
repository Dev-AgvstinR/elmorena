import React from "react";
import ReactDOM from "react-dom/client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Notifications from './components/common/Notifications';
import { notify } from './utils/notifications';

import App from "./App.jsx";
import "./index.css";
import "./libreta.css";

const reportedQueryErrors = new Set();
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.meta?.successMessage) notify.success(mutation.meta.successMessage);
    },
    onError: (error) => notify.error(error.message || 'No se pudo completar la acción.'),
  }),
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Un fallo de sincronización no debe repetir avisos cada pocos segundos.
      if (!reportedQueryErrors.has(query.queryHash)) {
        reportedQueryErrors.add(query.queryHash);
        notify.error(error.message || 'No se pudieron cargar los datos.');
      }
    },
    onSuccess: (_data, query) => reportedQueryErrors.delete(query.queryHash),
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Notifications />
    </QueryClientProvider>
  </React.StrictMode>,
);
