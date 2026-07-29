import { useEffect, useRef, useState } from 'react'
import lottie from 'lottie-web/build/player/lottie_light'
import cryingCat from './assets/Cat Crying emojiSticker animation.json'
import loveCat from './assets/Cat feeling love emotionsexpression. Emojisticker animation.json'

type MascotMode = 'crying' | 'love'

function MascotSticker() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<MascotMode>('crying')

  useEffect(() => {
    if (!containerRef.current) return undefined

    const animation = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: mode === 'crying' ? cryingCat : loveCat,
    })

    return () => animation.destroy()
  }, [mode])

  return (
    <button
      className={`mascot-sticker ${mode === 'love' ? 'loving' : ''}`}
      type="button"
      onClick={() => setMode('love')}
      title="Cheer up the cat"
      aria-label="Play cat love animation"
    >
      <span ref={containerRef} aria-hidden="true" />
    </button>
  )
}

export default MascotSticker
