

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

import { clearSession, sessionExpired } from '../slices/authSlice';
import { TOKEN_STORAGE_KEY } from '../../constants';

/**
 * The single RTK Query API slice.
 *
 * Every network call in the app goes through here — the spec asks for "RTK
 * Query: all API calls with caching", and keeping one slice means the cache is
 * genuinely shared: the dashboard's stats and the profile's stats are the same
 * cache entry, not two requests.
 *
 * Caching model
 * -------------
 * Tags describe *what a response contains* so mutations can invalidate exactly
 * the queries they affect:
 *
 *   Drop         individual drops and drop lists
 *   RecallQueue  the due-for-review queue
 *   Stats        dashboard/profile counters and the streak
 *   Collection   collections and their contents
 *   Public       the unauthenticated explore feed
 *
 * A recall, for instance, changes the drop, empties it from the queue and moves
 * the counters — so it invalidates all three, and nothing else.
 */

// Strips any trailing slash(es) so a VITE_API_URL set to either
// "https://api.example.com" or "https://api.example.com/" produces the same
// base URL - a trailing slash otherwise doubles up with the leading slash on
// "/api" below and 404s every request (the extra slash isn't collapsed by
// Express's router).
const API_ROOT = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

const rawBaseQuery = fetchBaseQuery({
  // Empty in development: vite proxies /api to the API server, so a relative
  // URL keeps everything same-origin.
  baseUrl: `${API_ROOT}/api`,

  // Send the httpOnly session cookie. The Bearer header below is the primary
  // mechanism; the cookie is the fallback that survives a hard refresh.
  credentials: 'include',

  prepareHeaders: (headers, { getState }) => {
    // Prefer the token in Redux; fall back to storage so the very first request
    // after a reload (before rehydration completes) is still authenticated.
    const token = getState().auth.token || readStoredToken();

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    return headers;
  }
});

function readStoredToken() {
  try {
    const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

/**
 * Wraps the base query to handle 401 centrally.
 *
 * Without this every component would need its own "was I logged out?" branch.
 * Here, one expired token anywhere in the app clears the session and lets the
 * router redirect to /login — but only for genuinely authenticated endpoints,
 * since a 401 from a public route means nothing.
 */
const baseQueryWithAuthHandling = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    const url = typeof args === 'string' ? args : args.url || '';
    const isPublicRoute = url.startsWith('/public');
    const isLoginAttempt = url.startsWith('/auth/login') || url.startsWith('/auth/register');

    if (!isPublicRoute && !isLoginAttempt && api.getState().auth.token) {
      api.dispatch(sessionExpired());
      api.dispatch(clearSession());
    }
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuthHandling,
  tagTypes: ['Drop', 'RecallQueue', 'Stats', 'Collection', 'Public', 'User'],

  // Refetch when the user returns to the tab: recall schedules are time-based,
  // so a queue left open for an hour is stale by definition.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  keepUnusedDataFor: 120,

  endpoints: (builder) => ({
    /* ---------------------------------------------------------------- */
    /* Auth                                                             */
    /* ---------------------------------------------------------------- */

    login: builder.mutation({
      query: (credentials) => ({ url: '/auth/login', method: 'POST', body: credentials }),
      transformResponse: (response) => response.data,
      // A fresh session must not read another account's cached data.
      invalidatesTags: ['Drop', 'RecallQueue', 'Stats', 'Collection', 'User']
    }),

    register: builder.mutation({
      query: (details) => ({ url: '/auth/register', method: 'POST', body: details }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Drop', 'RecallQueue', 'Stats', 'Collection', 'User']
    }),

    logout: builder.mutation({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Drop', 'RecallQueue', 'Stats', 'Collection', 'User']
    }),

    getMe: builder.query({
      query: () => '/auth/me',
      transformResponse: (response) => response.data,
      providesTags: ['User', 'Stats']
    }),

    updatePreferences: builder.mutation({
      query: (preferences) => ({
        url: '/auth/preferences',
        method: 'PUT',
        body: preferences
      }),
      transformResponse: (response) => response.data.user,

      // Optimistic: the theme toggle must feel instant. Patching the cached
      // `getMe` response means the UI flips before the request resolves.
      async onQueryStarted(preferences, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          apiSlice.util.updateQueryData('getMe', undefined, (draft) => {
            if (draft && draft.user) {
              Object.assign(draft.user.preferences, preferences);
            }
          })
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patch.undo();
        }
      },

      // The pace preference changes every future interval, so schedules shown
      // anywhere in the app are now stale.
      invalidatesTags: ['User', 'Drop', 'RecallQueue']
    }),

    /* ---------------------------------------------------------------- */
    /* Drops                                                            */
    /* ---------------------------------------------------------------- */

    getDrops: builder.query({
      query: (params = {}) => ({ url: '/drops', params: cleanParams(params) }),
      transformResponse: (response) => ({
        drops: response.data,
        pagination: response.pagination
      }),

      // Tag each drop individually as well as the list, so invalidating one
      // drop does not blow away every cached page.
      providesTags: (result) =>
        result
          ? [
              ...result.drops.map((drop) => ({ type: 'Drop', id: drop.id })),
              { type: 'Drop', id: 'LIST' }
            ]
          : [{ type: 'Drop', id: 'LIST' }]
    }),

    getDrop: builder.query({
      query: (id) => `/drops/${id}`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, id) => [{ type: 'Drop', id }]
    }),

    getRecallQueue: builder.query({
      query: (params = {}) => ({ url: '/drops/recall', params: cleanParams(params) }),
      transformResponse: (response) => ({ drops: response.data, meta: response.meta }),
      providesTags: ['RecallQueue']
    }),

    getStats: builder.query({
      query: () => '/drops/stats',
      transformResponse: (response) => response.data,
      providesTags: ['Stats']
    }),

    getRecentDrops: builder.query({
      query: () => '/drops/recent',
      transformResponse: (response) => response.data,
      providesTags: [{ type: 'Drop', id: 'RECENT' }]
    }),

    getRelatedDrops: builder.query({
      query: (id) => `/drops/related/${id}`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, id) => [{ type: 'Drop', id: `RELATED-${id}` }]
    }),

    createDrop: builder.mutation({
      query: (drop) => ({ url: '/drops', method: 'POST', body: drop }),
      transformResponse: (response) => response.data,
      invalidatesTags: [
        { type: 'Drop', id: 'LIST' },
        { type: 'Drop', id: 'RECENT' },
        'RecallQueue',
        'Stats',
        'Collection',
        'Public'
      ]
    }),

    updateDrop: builder.mutation({
      query: ({ id, ...changes }) => ({ url: `/drops/${id}`, method: 'PUT', body: changes }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Drop', id },
        { type: 'Drop', id: 'LIST' },
        { type: 'Drop', id: 'RECENT' },
        'Stats',
        'Public'
      ]
    }),

    toggleFavorite: builder.mutation({
      query: (id) => ({ url: `/drops/${id}/favorite`, method: 'PATCH' }),
      transformResponse: (response) => response.data,

      // Optimistic: a star that waits for the network feels broken. Every
      // cached `getDrops` page is patched, plus the single-drop entry.
      async onQueryStarted(id, { dispatch, queryFulfilled, getState }) {
        const patches = [];

        selectCachedDropListArgs(getState()).forEach((args) => {
          patches.push(
            dispatch(
              apiSlice.util.updateQueryData('getDrops', args, (draft) => {
                const drop = draft.drops.find((item) => item.id === id);
                if (drop) {
                  drop.isFavorite = !drop.isFavorite;
                }
              })
            )
          );
        });

        patches.push(
          dispatch(
            apiSlice.util.updateQueryData('getDrop', id, (draft) => {
              if (draft && draft.drop) {
                draft.drop.isFavorite = !draft.drop.isFavorite;
              }
            })
          )
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patches.forEach((patch) => patch.undo());
        }
      },

      invalidatesTags: ['Stats']
    }),

    deleteDrop: builder.mutation({
      query: (id) => ({ url: `/drops/${id}`, method: 'DELETE' }),

      // Optimistic: remove the card immediately so the list does not sit there
      // with a row the user just deleted.
      async onQueryStarted(id, { dispatch, queryFulfilled, getState }) {
        const patches = [];

        selectCachedDropListArgs(getState()).forEach((args) => {
          patches.push(
            dispatch(
              apiSlice.util.updateQueryData('getDrops', args, (draft) => {
                const index = draft.drops.findIndex((item) => item.id === id);
                if (index !== -1) {
                  draft.drops.splice(index, 1);
                  if (draft.pagination) {
                    draft.pagination.total = Math.max(0, draft.pagination.total - 1);
                  }
                }
              })
            )
          );
        });

        try {
          await queryFulfilled;
        } catch (error) {
          patches.forEach((patch) => patch.undo());
        }
      },

      invalidatesTags: (result, error, id) => [
        { type: 'Drop', id },
        { type: 'Drop', id: 'LIST' },
        { type: 'Drop', id: 'RECENT' },
        'RecallQueue',
        'Stats',
        'Collection',
        'Public'
      ]
    }),

    recallDrop: builder.mutation({
      query: ({ id, confidence, recallType }) => ({
        url: `/drops/${id}/recall`,
        method: 'POST',
        body: cleanParams({ confidence, recallType })
      }),
      transformResponse: (response) => response.data,

      // Optimistic: recall mode is keyboard-driven and fast. Waiting for the
      // round trip before advancing would make it feel sluggish, so the drop
      // leaves the queue immediately.
      async onQueryStarted({ id }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          apiSlice.util.updateQueryData('getRecallQueue', {}, (draft) => {
            const index = draft.drops.findIndex((item) => item.id === id);
            if (index !== -1) {
              draft.drops.splice(index, 1);
              if (draft.meta) {
                draft.meta.total = Math.max(0, draft.meta.total - 1);
                draft.meta.recalledToday = (draft.meta.recalledToday || 0) + 1;
              }
            }
          })
        );

        try {
          await queryFulfilled;
        } catch (error) {
          patch.undo();
        }
      },

      invalidatesTags: (result, error, { id }) => [
        { type: 'Drop', id },
        { type: 'Drop', id: 'LIST' },
        'RecallQueue',
        'Stats'
      ]
    }),

    relateDrops: builder.mutation({
      query: ({ id, relatedDropId }) => ({
        url: `/drops/${id}/relate`,
        method: 'POST',
        body: { relatedDropId }
      }),
      transformResponse: (response) => response.data,

      // Both directions change, so both drops' caches are invalidated.
      invalidatesTags: (result, error, { id, relatedDropId }) => [
        { type: 'Drop', id },
        { type: 'Drop', id: relatedDropId },
        { type: 'Drop', id: `RELATED-${id}` },
        { type: 'Drop', id: `RELATED-${relatedDropId}` }
      ]
    }),

    unrelateDrops: builder.mutation({
      query: ({ id, relatedDropId }) => ({
        url: `/drops/${id}/relate/${relatedDropId}`,
        method: 'DELETE'
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id, relatedDropId }) => [
        { type: 'Drop', id },
        { type: 'Drop', id: relatedDropId },
        { type: 'Drop', id: `RELATED-${id}` },
        { type: 'Drop', id: `RELATED-${relatedDropId}` }
      ]
    }),

    bulkAction: builder.mutation({
      query: (payload) => ({ url: '/drops/bulk', method: 'POST', body: payload }),
      transformResponse: (response) => response.data,
      invalidatesTags: [
        { type: 'Drop', id: 'LIST' },
        { type: 'Drop', id: 'RECENT' },
        'RecallQueue',
        'Stats',
        'Collection',
        'Public'
      ]
    }),

    /* ---------------------------------------------------------------- */
    /* Collections                                                      */
    /* ---------------------------------------------------------------- */

    getCollections: builder.query({
      query: () => '/collections',
      transformResponse: (response) => response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map((collection) => ({ type: 'Collection', id: collection.id })),
              { type: 'Collection', id: 'LIST' }
            ]
          : [{ type: 'Collection', id: 'LIST' }]
    }),

    getCollection: builder.query({
      query: ({ id, ...params }) => ({
        url: `/collections/${id}`,
        params: cleanParams(params)
      }),
      transformResponse: (response) => ({
        collection: response.data.collection,
        drops: response.data.drops,
        pagination: response.pagination
      }),
      providesTags: (result, error, { id }) => [{ type: 'Collection', id }]
    }),

    createCollection: builder.mutation({
      query: (collection) => ({ url: '/collections', method: 'POST', body: collection }),
      transformResponse: (response) => response.data,
      invalidatesTags: [{ type: 'Collection', id: 'LIST' }, 'Stats']
    }),

    updateCollection: builder.mutation({
      query: ({ id, ...changes }) => ({
        url: `/collections/${id}`,
        method: 'PUT',
        body: changes
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Collection', id },
        { type: 'Collection', id: 'LIST' }
      ]
    }),

    deleteCollection: builder.mutation({
      query: (id) => ({ url: `/collections/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Collection', id: 'LIST' }, 'Stats']
    }),

    addDropToCollection: builder.mutation({
      query: ({ id, dropId }) => ({
        url: `/collections/${id}/drops`,
        method: 'POST',
        body: { dropId }
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Collection', id },
        { type: 'Collection', id: 'LIST' }
      ]
    }),

    removeDropFromCollection: builder.mutation({
      query: ({ id, dropId }) => ({
        url: `/collections/${id}/drops/${dropId}`,
        method: 'DELETE'
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'Collection', id },
        { type: 'Collection', id: 'LIST' }
      ]
    }),

    shareCollection: builder.mutation({
      query: (id) => ({ url: `/collections/${id}/share`, method: 'GET' }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, id) => [
        { type: 'Collection', id },
        { type: 'Collection', id: 'LIST' }
      ]
    }),

    unshareCollection: builder.mutation({
      query: (id) => ({ url: `/collections/${id}/share`, method: 'DELETE' }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, id) => [
        { type: 'Collection', id },
        { type: 'Collection', id: 'LIST' }
      ]
    }),

    /* ---------------------------------------------------------------- */
    /* Public (no auth)                                                 */
    /* ---------------------------------------------------------------- */

    explorePublicDrops: builder.query({
      query: (params = {}) => ({ url: '/public/explore', params: cleanParams(params) }),
      transformResponse: (response) => ({
        drops: response.data,
        pagination: response.pagination
      }),
      providesTags: ['Public']
    }),

    getSharedCollection: builder.query({
      query: (token) => `/public/share/${token}`,
      transformResponse: (response) => response.data
    })
  })
});

/**
 * Drops empty values so they never reach the query string.
 *
 * `?search=&type=` would fail the server's strict Joi validation, and an empty
 * string is not a filter the user asked for.
 */
function cleanParams(params) {
  const output = {};

  Object.keys(params || {}).forEach((key) => {
    const value = params[key];

    if (value !== undefined && value !== null && value !== '' && value !== false) {
      output[key] = value;
    }
  });

  return output;
}

/**
 * Every cached `getDrops` argument set currently in the store.
 *
 * Optimistic updates have to patch *all* of them — the user may have the
 * explorer, the favourites tab and a filtered view mounted at once, and a star
 * toggled in one must flip in the others too.
 */
function selectCachedDropListArgs(state) {
  const queries = state.api?.queries || {};

  return Object.values(queries)
    .filter((entry) => entry && entry.endpointName === 'getDrops' && entry.status === 'fulfilled')
    .map((entry) => entry.originalArgs);
}

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useGetMeQuery,
  useUpdatePreferencesMutation,

  useGetDropsQuery,
  useGetDropQuery,
  useGetRecallQueueQuery,
  useGetStatsQuery,
  useGetRecentDropsQuery,
  useGetRelatedDropsQuery,
  useCreateDropMutation,
  useUpdateDropMutation,
  useToggleFavoriteMutation,
  useDeleteDropMutation,
  useRecallDropMutation,
  useRelateDropsMutation,
  useUnrelateDropsMutation,
  useBulkActionMutation,

  useGetCollectionsQuery,
  useGetCollectionQuery,
  useCreateCollectionMutation,
  useUpdateCollectionMutation,
  useDeleteCollectionMutation,
  useAddDropToCollectionMutation,
  useRemoveDropFromCollectionMutation,
  useShareCollectionMutation,
  useUnshareCollectionMutation,

  useExplorePublicDropsQuery,
  useGetSharedCollectionQuery
} = apiSlice;
