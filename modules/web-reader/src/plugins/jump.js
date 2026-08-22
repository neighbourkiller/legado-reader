const easeInOutQuad = (t, b, c, d) => {
    t /= d / 2;
    if (t < 1)
        return (c / 2) * t * t + b;
    t--;
    return (-c / 2) * (t * (t - 2) - 1) + b;
};
const jumper = () => {
    let container;
    let element;
    let start;
    let stop;
    let offset;
    let easing;
    let a11y;
    let distance;
    let duration;
    let timeStart;
    let timeElapsed;
    let next;
    let callback;
    function location() {
        if ('scrollTop' in container && typeof container.scrollTop === 'number') {
            return container.scrollTop;
        }
        return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    function top(el) {
        const elementTop = el.getBoundingClientRect().top;
        const containerTop = 'getBoundingClientRect' in container
            ? container.getBoundingClientRect().top
            : 0;
        return elementTop - containerTop + start;
    }
    function scrollToPos(pos) {
        if ('scrollTo' in container && typeof container.scrollTo === 'function') {
            container.scrollTo(0, pos);
        }
        else if ('scrollTop' in container) {
            ;
            container.scrollTop = pos;
        }
        else {
            window.scrollTo(0, pos);
        }
    }
    function loop(timeCurrent) {
        if (!timeStart) {
            timeStart = timeCurrent;
        }
        timeElapsed = timeCurrent - timeStart;
        next = easing(timeElapsed, start, distance, duration);
        scrollToPos(next);
        if (timeElapsed < duration) {
            requestAnimationFrame(loop);
        }
        else {
            done();
        }
    }
    function done() {
        scrollToPos(start + distance);
        if (element && a11y) {
            element.setAttribute('tabindex', '-1');
            element.focus();
        }
        if (typeof callback === 'function') {
            callback();
        }
        timeStart = false;
    }
    function jump(target, options = {}) {
        duration = typeof options.duration === 'number' ? options.duration : 1000;
        offset = options.offset || 0;
        callback = options.callback;
        easing = options.easing || easeInOutQuad;
        a11y = options.a11y || false;
        if (typeof options.container === 'object' && options.container !== null) {
            container = options.container;
        }
        else if (typeof options.container === 'string') {
            container = document.querySelector(options.container) || window;
        }
        else {
            container = window;
        }
        start = location();
        if (typeof target === 'number') {
            element = undefined;
            a11y = false;
            stop = start + target;
        }
        else if (typeof target === 'object' && target !== null) {
            element = target;
            stop = top(element);
        }
        else if (typeof target === 'string') {
            element = document.querySelector(target);
            stop = element ? top(element) : start;
        }
        else {
            stop = start;
        }
        distance = stop - start + offset;
        if (typeof options.duration === 'function') {
            duration = options.duration(distance);
        }
        requestAnimationFrame(loop);
    }
    return jump;
};
const jump = jumper();
export default jump;
