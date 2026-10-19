import { useState } from "react"
import { Card } from "./components/Card"

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button id="counter" onClick={() => setCount((c) => c + 1)}>
      count is {count}
    </button>
  )
}

export default function App() {
  return (
    <main id="app">
      <Card
        title="Vite card"
      >
        <Counter />
      </Card>
    </main>
  )
}
