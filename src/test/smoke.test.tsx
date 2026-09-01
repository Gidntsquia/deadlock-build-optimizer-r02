import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

describe('App', () => {
  it('mounts and shows the app title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /deadlock build optimizer/i })).toBeInTheDocument()
  })
})
