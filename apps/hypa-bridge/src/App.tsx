import { RouterProvider, createBrowserRouter, Navigate } from "react-router";
import { useEffect } from "react";
import { StoreProvider, useStore } from "./store";
import { warmUpAudio } from "./lib/audio";
import { Toaster } from "sonner";
import { SetupPage } from "./pages/setup";
import { ConversationPage } from "./pages/conversation";

const router = createBrowserRouter([
  { path: "/", element: <SetupPage /> },
  { path: "/c/:id", element: <ConversationPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);

/** Unlock the AudioContext on the first gesture (iOS autoplay policy). */
function AudioUnlock() {
  useEffect(() => {
    const unlock = () => warmUpAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  return null;
}

function AppToaster() {
  const { effectiveDark } = useStore();
  return (
    <Toaster
      theme={effectiveDark ? "dark" : "light"}
      position="top-center"
      toastOptions={{
        style: { borderRadius: "12px" },
      }}
    />
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AudioUnlock />
      <RouterProvider router={router} />
      <AppToaster />
    </StoreProvider>
  );
}
