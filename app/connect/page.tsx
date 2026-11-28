import Link from "next/link";

const DOORS = [
  {
    href: "/connect/member/login",
    title: "Member login",
    text: "For approved members of the workspace.",
    cta: "Sign in as a member",
  },
  {
    href: "/connect/admin/login",
    title: "Administrator login",
    text: "Password plus two-factor authentication.",
    cta: "Sign in as administrator",
  },
];

export default function ConnectGateway() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      <p className="text-center text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Private Connect</p>
      <h1 className="mt-4 text-center text-4xl font-black text-white md:text-6xl">A private workspace</h1>
      <p className="mx-auto mt-4 max-w-xl text-center leading-7 text-slate-300">
        Chat, meetings and shared files for invited members. Accounts are approved by the administrator.
      </p>
      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {DOORS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="group relative overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-slate-950/80 p-8 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/60"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-300/0 blur-3xl transition duration-500 group-hover:bg-cyan-300/20" />
            <h2 className="relative text-2xl font-black text-white">{d.title}</h2>
            <p className="relative mt-2 text-slate-400">{d.text}</p>
            <span className="relative mt-6 inline-block font-black text-cyan-300">{d.cta}</span>
          </Link>
        ))}
      </div>
      <p className="mt-10 text-center text-slate-400">
        New here?{" "}
        <Link href="/connect/register" className="font-bold text-cyan-300 hover:text-white">
          Request an account
        </Link>
      </p>
    </div>
  );
}
