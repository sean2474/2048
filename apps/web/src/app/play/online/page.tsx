"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Users } from "lucide-react"
import { BoardView } from "@/components/2048/board"
import { initBoard } from "@/lib/2048"

export default function SearchingScreen() {
  const [userName] = useState("Player_2048")
  const [searchTime, setSearchTime] = useState(0)

  // useEffect(() => {
  //   const timer = setInterval(() => {
  //     setSearchTime((prev) => prev + 1)
  //   }, 1000)

  //   return () => clearInterval(timer)
  // }, [])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          {/* Left Side - User Info & Game Preview */}
          <div className="space-y-6">
            <div className="p-6 bg-card border-2 border-border">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-16 w-16 border-2 border-primary">
                  <div className="bg-primary text-primary-foreground text-xl font-bold">
                    {userName.slice(0, 2).toUpperCase()}
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">{userName}</h2>
                  <p className="text-muted-foreground">Ready to play</p>
                </div>
              </div>
              <BoardView board={initBoard(4, 8)} />
              <div className="mt-6 flex items-center justify-between text-sm">
                <div>
                  <p className="text-muted-foreground">Best Score</p>
                  <p className="text-2xl font-bold text-primary">12,480</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Games Played</p>
                  <p className="text-2xl font-bold text-secondary">47</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Searching Status */}
          <div className="space-y-6">
            <div className="p-8 bg-card border-2 border-border text-center">
              <div className="space-y-6">
                {/* Animated Icon */}
                <div className="flex justify-center">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative bg-primary/10 p-6 rounded-full">
                      <Users className="h-16 w-16 text-primary animate-spin-slow" />
                    </div>
                  </div>
                </div>

                {/* Searching Text */}
                <div className="space-y-2">
                  <h1 className="text-4xl font-bold text-foreground flex items-center justify-center gap-2">
                    Searching
                    <span className="flex gap-1">
                      <span className="animate-pulse-dot-1">.</span>
                      <span className="animate-pulse-dot-2">.</span>
                      <span className="animate-pulse-dot-3">.</span>
                    </span>
                  </h1>
                  <p className="text-muted-foreground text-lg">Looking for an opponent</p>
                </div>

                {/* Search Time */}
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-muted rounded-full">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-mono text-muted-foreground">
                    {Math.floor(searchTime / 60)
                      .toString()
                      .padStart(2, "0")}
                    :{(searchTime % 60).toString().padStart(2, "0")}
                  </span>
                </div>

                {/* Status Info */}
                <div className="space-y-3 pt-4">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                    <span>Searching in your region</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <div className="h-2 w-2 bg-accent rounded-full animate-pulse" />
                    <span>Matching skill level</span>
                  </div>
                </div>

                {/* Cancel Button */}
                <div className="pt-4">
                  <Button variant="outline" size="lg" className="w-full border-2 bg-transparent">
                    Cancel Search
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="p-4 bg-muted/50 border border-border">
              <h4 className="font-semibold text-sm text-foreground mb-2">💡 Quick Tip</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                In multiplayer mode, the first player to reach 2048 wins! Use arrow keys to move tiles and combine
                matching numbers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
