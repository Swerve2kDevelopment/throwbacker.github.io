import Link from "next/link";

export function Pagination({
  currentPage,
  totalPages,
  basePath
}: {
  currentPage: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center gap-2 text-sm font-bold">
      {Array.from({ length: totalPages }).map((_, index) => {
        const page = index + 1;
        return (
          <Link
            key={page}
            className={page === currentPage ? "button button-primary" : "button"}
            href={`${basePath}?page=${page}`}
          >
            {page}
          </Link>
        );
      })}
    </div>
  );
}
