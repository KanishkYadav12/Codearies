import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import { apiSlice } from './api/apiSlice';
import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    [apiSlice.reducerPath]: apiSlice.reducer,
    auth: authReducer,
    ui: uiReducer
  },

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // RTK Query's internal actions carry non-serialisable payloads by
        // design; everything the app dispatches itself is plain JSON.
        ignoredActions: [
          'api/executeQuery/pending',
          'api/executeQuery/fulfilled',
          'api/executeQuery/rejected'
        ]
      }
    }).concat(apiSlice.middleware),

  devTools: import.meta.env.DEV
});

// Enables refetchOnFocus / refetchOnReconnect, which the API slice opts into.
setupListeners(store.dispatch);

export default store;
