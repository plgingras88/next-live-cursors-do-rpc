import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Cursors } from "./cursor";
import { nanoid } from "nanoid";

export const dynamic = "force-dynamic";

async function closeSessions() {
  "use server";
  const cf = await getCloudflareContext();
  await cf.env.RPC_SERVICE.closeSessions();

  // const id = cf.env.CURSOR_SESSIONS.idFromName("globalRoom");
  // const stub = cf.env.CURSOR_SESSIONS.get(id);
  // await stub.closeSessions();
}

export default function Home() {
  const id = `ws_${nanoid(50)}`;
  return (
    <main className="flex min-h-screen flex-col items-center p-24 justify-center">
      <div className="border border-dashed w-full">
        <p className="pt-2 px-2">Server Actions</p>
        <div className="p-2">
          <form action={closeSessions}>
            <button className="border px-2 py-1">Close WebSockets</button>
          </form>
        </div>
      </div>
      <div className="border border-dashed w-full mt-2.5">
        <p className="py-2 px-2">Live Cursors</p>
        <div className="px-2 space-y-2">
          <Cursors id={id}></Cursors>
        </div>
      </div>
    </main>
  );
}
