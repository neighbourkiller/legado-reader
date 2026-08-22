export interface JumpOptions {
  duration?: number | ((distance: number) => number)
  offset?: number
  callback?: () => void
  easing?: (t: number, b: number, c: number, d: number) => number
  a11y?: boolean
  container?: HTMLElement | string | Window
}

const easeInOutQuad = (t: number, b: number, c: number, d: number) => {
  t /= d / 2
  if (t < 1) return (c / 2) * t * t + b
  t--
  return (-c / 2) * (t * (t - 2) - 1) + b
}

const jumper = () => {
  let container: HTMLElement | Window
  let element: HTMLElement | undefined
  let start: number
  let stop: number
  let offset: number
  let easing: (t: number, b: number, c: number, d: number) => number
  let a11y: boolean
  let distance: number
  let duration: number
  let timeStart: number | false
  let timeElapsed: number
  let next: number
  let callback: (() => void) | undefined

  function location() {
    if ('scrollTop' in container && typeof container.scrollTop === 'number') {
      return container.scrollTop
    }
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
  }

  function top(el: HTMLElement) {
    const elementTop = el.getBoundingClientRect().top
    const containerTop = 'getBoundingClientRect' in container
      ? (container as HTMLElement).getBoundingClientRect().top
      : 0
    return elementTop - containerTop + start
  }

  function scrollToPos(pos: number) {
    if ('scrollTo' in container && typeof container.scrollTo === 'function') {
      container.scrollTo(0, pos)
    } else if ('scrollTop' in container) {
      ;(container as HTMLElement).scrollTop = pos
    } else {
      window.scrollTo(0, pos)
    }
  }

  function loop(timeCurrent: number) {
    if (!timeStart) {
      timeStart = timeCurrent
    }
    timeElapsed = timeCurrent - timeStart
    next = easing(timeElapsed, start, distance, duration)
    scrollToPos(next)

    if (timeElapsed < duration) {
      requestAnimationFrame(loop)
    } else {
      done()
    }
  }

  function done() {
    scrollToPos(start + distance)
    if (element && a11y) {
      element.setAttribute('tabindex', '-1')
      element.focus()
    }
    if (typeof callback === 'function') {
      callback()
    }
    timeStart = false
  }

  function jump(target: number | HTMLElement | string, options: JumpOptions = {}) {
    duration = typeof options.duration === 'number' ? options.duration : 1000
    offset = options.offset || 0
    callback = options.callback
    easing = options.easing || easeInOutQuad
    a11y = options.a11y || false

    if (typeof options.container === 'object' && options.container !== null) {
      container = options.container as HTMLElement | Window
    } else if (typeof options.container === 'string') {
      container = (document.querySelector(options.container) as HTMLElement) || window
    } else {
      container = window
    }

    start = location()

    if (typeof target === 'number') {
      element = undefined
      a11y = false
      stop = start + target
    } else if (typeof target === 'object' && target !== null) {
      element = target
      stop = top(element)
    } else if (typeof target === 'string') {
      element = document.querySelector(target) as HTMLElement
      stop = element ? top(element) : start
    } else {
      stop = start
    }

    distance = stop - start + offset

    if (typeof options.duration === 'function') {
      duration = options.duration(distance)
    }

    requestAnimationFrame(loop)
  }

  return jump
}

const jump = jumper()
export default jump
