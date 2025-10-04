'use client';

import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export const LoginBtn = ({ type }: { type: "google" }) => {

  const handleLogin = async () => {
    console.log("login");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
    });
    if (error) {
      console.error("Error signing in:", error);
    }
    if (data) {
      console.log("User signed in:", data);
    }
  }

  let buttonStyle;
  switch (type) {
    case "google":
      buttonStyle = "border-[#8e8e8e] bg-white";
      break;
  }

  return (
    <div className={`relative flex items-center cursor-pointer w-full h-14 pl-14 border-[1.5px] border-solid font-GowunBatang font-bold rounded-md hover:brightness-90 transition duration-300 ${buttonStyle}`} onClick={handleLogin}>
      <div className="absolute w-5 h-5 left-7 top-1/2 -translate-1/2">
        <Image src={`/icons/${type}_icon.svg`} alt={""} fill />
      </div>
      <div>
        Continue with {type}
      </div>
    </div>
  );
}
