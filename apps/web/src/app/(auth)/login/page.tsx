import { LoginForm } from '@/components/widget/login-form';
import Link from 'next/link';
import { LoginBtn } from '@/components/ui/login-button';

export default async function LoginPage() {
  return ( 
    <main className='absolute top-1/2 left-1/2 -translate-1/2 flex justify-center items-center border border-primary/30 max-w-xl mx-auto w-full bg-white shadow-sm rounded'>
      <div className='flex flex-col justify-center items-center py-16 px-3 md:px-10 w-[400px]'>
        <div className='flex items-center justify-start w-full'>
          <div className='text-2xl font-bold'>
            Welcome Back
          </div>
        </div>

        <LoginForm />

        <div className='mt-6'>
          No account?
          <Link href={'/auth/signup'} className='font-bold ml-1'>
            Sign Up
          </Link>
        </div>

        <div className="border border-primary/30 w-[99%] mt-6" />

        <div className="flex flex-col space-y-2 w-full mt-6">
          <LoginBtn type="google" />
        </div>
      </div>
    </main>
  );
}