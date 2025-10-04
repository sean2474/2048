'use client';

import { EmailInput, PasswordInput } from '@/components/ui/input';
import Link from 'next/link';
import { useActionState } from 'react';

export function LoginForm() {
  const [state, formAction] = useActionState(async () => { 
    return { error: "" };
  }, null);

  return (
    <form className='w-full' action={formAction}>
      {state?.error && <p className='text-red-500 text-sm absolute -translate-y-3 translate-x-2'>{state.error}</p>}
      <EmailInput bgColor="white" />
      <PasswordInput bgColor="white" />

      <div className="flex items-center justify-between mt-3">
        <Link href={'#'} className='underline'> Forgot Password? </Link>
      </div>

      <button type='submit' className='w-full text-background bg-primary border-primary border transition-all duration-300 hover:bg-transparent hover:text-primary mt-3 h-14 rounded-md font-bold'>
        Continue
      </button>
    </form>
  );
}