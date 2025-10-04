import { Button } from "../ui/button"

export const Header = () => {
  return (
    <header className="flex justify-end gap-2 px-3 py-4"> 
      <Button size="lg" variant="default">
        Login
      </Button>
      <Button size="lg" variant="outline">
        Sign Up
      </Button>
    </header>
  )
}