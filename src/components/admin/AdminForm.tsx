export function AdminForm({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-4">
      <div className="mb-4 border-b border-metal-line pb-3">
        <h2 className="text-lg font-black">{title}</h2>
        {description ? <p className="mt-1 text-sm text-metal-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  className = ""
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function AdminStatusBanner({ searchParams }: { searchParams: { saved?: string; deleted?: string; error?: string; notice?: string } }) {
  const notice = searchParams.notice ? <div className="notice-banner">{decodeURIComponent(searchParams.notice)}</div> : null;

  if (searchParams.error) {
    return <div className="mb-4 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm font-bold text-red-100">{decodeURIComponent(searchParams.error)}</div>;
  }

  if (searchParams.saved) {
    return (
      <>
        <div className="notice-banner">Saved.</div>
        {notice}
      </>
    );
  }

  if (searchParams.deleted) {
    return <div className="mb-4 rounded-md border border-metal-line bg-metal-panel2 p-3 text-sm font-bold text-metal-muted">Deleted.</div>;
  }

  return notice;
}
