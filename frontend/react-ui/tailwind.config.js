module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0b',
        panel: '#131316',
        panel2: '#1c1c20',
        line: '#232327',
        line2: '#34343a',
        bone: '#eae7e0',
        dim: '#8a8a90',
        faint: '#4d4d52',
        signal: '#4fd1c5',
        crit: '#ff4d3d',
        high: '#ff9f40',
        med: '#e8c14a',
        low: '#5b93b0',
        ok: '#3ecf8e',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '3px',
        sm: '2px',
      },
    },
  },
  plugins: [],
}
