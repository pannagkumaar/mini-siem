import React, { useState, useEffect } from 'react'

// Simple test component to verify AI button functionality
export function TestAIButton() {
  const [message, setMessage] = useState('Loading...')

  const handleTestAI = async () => {
    setMessage('Testing AI...')
    try {
      const response = await fetch('http://localhost:8000/ai/stats')
      const result = await response.json()
      setMessage(`AI Status: ${result.status || 'unknown'}`)
    } catch (err) {
      setMessage(`Error: ${err.message}`)
    }
  }

  return (
    <div className="p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
      <h3 className="text-white text-lg mb-2">AI Test Component</h3>
      <p className="text-gray-300 mb-3">Status: {message}</p>
      <button
        onClick={handleTestAI}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition"
      >
        🤖 Test AI Connection
      </button>
    </div>
  )
}

// Add this test component to your Alerts page by importing and adding:
// <TestAIButton />