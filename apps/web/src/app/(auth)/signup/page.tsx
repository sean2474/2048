import { LoginBtn } from '@/components/ui/login-button';
import { SignupForm } from '@/components/widget/signup-form';

export default async function Page() {

  return ( 
    <main className='absolute top-1/2 left-1/2 -translate-1/2 flex justify-center items-center border border-primary/30 max-w-xl mx-auto w-full bg-white shadow-sm rounded'>
      <div className='flex flex-col justify-center items-center py-16 px-3 md:px-10 w-[400px]'>
        <div className='flex items-center justify-start w-full'>
          <div className='text-2xl font-bold'>
            Sign Up
          </div>
        </div>
        <SignupForm />
        <div className="border border-primary/30 w-[99%] mt-6" />
        <div className="flex flex-col space-y-2 w-full mt-6">
          <LoginBtn type="google" />
        </div>
      </div>
    </main>
  );
}