'use client';

import { ChangeEvent, FormEvent, useState } from 'react';
import { EmailInput, PasswordConfirmInput, PasswordInput } from '@/components/ui/input';
import Link from "next/link";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [password, setPassword] = useState("");
  const [rules, setRules] = useState({ 
    hasMinLength: false, 
    hasLetter: false, 
    hasDigit: false, 
    hasSpecial: false 
  });
  const [showPwIndicator, setShowPwIndicator] = useState(false);

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    const pw = e.target.value;
    setPassword(pw);
    setRules(checkPasswordRules(pw));
    const isPwComplete = Object.values(rules).every(value => value === true);
    if (isPwComplete) {
      setShowPwIndicator(false);
    } else {
      setShowPwIndicator(true);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    setIsLoading(true);
    setError(null);

    if (!isValidPassword(formData.get("password") as string)) {
      setError("wrong Pw");
      return;
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className='w-full'>
        {error && (
          <p className='text-red-500 text-sm absolute -translate-y-3 translate-x-2'>
            {error}
          </p>
        )}

        {/* defaultValue로 읽기 전용 email */}
        <EmailInput />
        <div className="relative">
          <PasswordInput onChange={handlePasswordChange} value={password} onFocus={() => setShowPwIndicator(true)} onBlur={() => setShowPwIndicator(false)}/>
          {showPwIndicator && <PasswordRulesIndicator rules={rules} />}
        </div>
        <PasswordConfirmInput />

        <button type='submit' className='w-full text-background bg-primary border-primary border border-solid transition-all duration-300 hover:bg-transparent hover:text-primary mt-6 h-14 rounded-md font-bold'>
          {isLoading ? "Proceeding..." : "Continue"}
          </button>
        </form>
        <Link className='text-primary bg-white hover:brightness-90 transition duration-300 mt-3 flex items-center justify-center text-center h-10 px-3 rounded-md font-bold' href={`/login`}>
          Go Back
        </Link>
    </>
  );
}

interface Rules {
  hasMinLength: boolean,
  hasLetter: boolean,
  hasDigit: boolean,
  hasSpecial: boolean
}

function checkPasswordRules(password: string) {
  return {
    hasMinLength: password.length >= 10,
    hasLetter: /[A-Za-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_\-+=\[\]{};':"\\|,.<>\/?`~]/.test(password),
  };
}

function isValidPassword(password: string): boolean {
  // 아래 예시는 !@#$%^&*() 등 대부분 기호를 포함
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[\]{};':"\\|,.<>\/?`~])[\S]{10,}$/;
  return passwordRegex.test(password);
}

function PasswordRulesIndicator({ rules }: { rules: Rules }) {
  return (
    <ul className='bg-white p-2.5 absolute z-40 left-0 top-16 border border-solid border-font rounded-md space-y-1'>
      <li className='flex items-center'>
        <span className='font-mono pr-2 text-xs'>{rules.hasMinLength ? "✅" : "❌"}</span> {"At least 10 characters"}
      </li>
      <li className='flex items-center'>
        <span className='font-mono pr-2 text-xs'>{rules.hasLetter ? "✅" : "❌"}</span> {"At least one letter"}
      </li>
      <li className='flex items-center'>
        <span className='font-mono pr-2 text-xs'>{rules.hasDigit ? "✅" : "❌"}</span> {"At least one digit"}
      </li>
      <li className='flex items-center'>
        <span className='font-mono pr-2 text-xs'>{rules.hasSpecial ? "✅" : "❌"}</span> {"At least one special character"}
      </li>
      <div className='absolute w-2 h-2 bg-white border-l border-t border-font top-0 left-[10%] translate-x-1/2 rotate-45 -translate-y-[9px]' />
    </ul>
  );
}