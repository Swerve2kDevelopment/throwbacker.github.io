export function SearchInput({
  defaultValue,
  placeholder = "Search",
  action
}: {
  defaultValue?: string;
  placeholder?: string;
  action?: string;
}) {
  return (
    <form action={action} className="flex w-full max-w-md gap-2">
      <input className="input" name="q" defaultValue={defaultValue} placeholder={placeholder} />
      <button className="button" type="submit">
        Search
      </button>
    </form>
  );
}
