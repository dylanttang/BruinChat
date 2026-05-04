import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function Signup() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/auth/welcome/welcome");
  }, [router]);

  return null;
}