import { useToggleFavoriteMutation } from '../../store/api/apiSlice';

/**
 * Favourite toggle star.
 *
 * The mutation is optimistic (see apiSlice.toggleFavorite), so this component
 * stays purely presentational — the star flips the instant it is clicked, and
 * `useToggleFavoriteMutation`'s cache patch is what makes that feel instant
 * everywhere the drop appears, not just here.
 */
export function FavoriteStar({ dropId, isFavorite, size = 'md' }) {
  const [toggleFavorite] = useToggleFavoriteMutation();

  const sizes = { sm: 'h-4 w-4', md: 'h-5 w-5' };

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        toggleFavorite(dropId);
      }}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
      className="rounded-md p-1 text-amber-400 transition-transform hover:scale-110 active:scale-95"
    >
      <svg
        viewBox="0 0 20 20"
        fill={isFavorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        className={sizes[size] || sizes.md}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 2.5l2.4 4.86 5.36.78-3.88 3.78.92 5.34L10 14.77l-4.8 2.5.92-5.34-3.88-3.78 5.36-.78L10 2.5z"
        />
      </svg>
    </button>
  );
}

export default FavoriteStar;
