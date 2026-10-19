import type { ReactNode } from "react"

export const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <article className="card" id="card">
    <h3 id="card-title">{title}</h3>
    {children}
  </article>
)
