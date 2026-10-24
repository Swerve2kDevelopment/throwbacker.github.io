export function FilterDropdown({
  name,
  label,
  value,
  options
}: {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex min-w-[180px] flex-col gap-1">
      <span className="label">{label}</span>
      <select className="input" name={name} defaultValue={value || ""}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
