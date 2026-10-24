// A template re-mounts on every navigation, which replays the fade-in.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
