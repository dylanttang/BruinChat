import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function Login() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/welcome/welcome");
  }, [router]);

  return null;
}