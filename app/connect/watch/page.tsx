import { redirect } from "next/navigation";

/** Watch together became Play together (one page for music and videos). */
export default function Page() {
  redirect("/connect/play");
}
