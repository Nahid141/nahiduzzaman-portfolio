import { redirect } from "next/navigation";

/** The music lounge and Watch together became Play together (one page for music and videos). */
export default function Page() {
  redirect("/connect/play");
}
