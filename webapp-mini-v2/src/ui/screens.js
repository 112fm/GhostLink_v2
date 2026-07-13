export function createScreenRouter(options = {}) {
  const screens = options.screens || [];
  const backBtn = options.backBtn || null;
  const helpBtn = options.helpBtn || null;
  const homeId = options.homeId || "screen-home";
  const fallbackId = options.fallbackId || "";

  const stack = [homeId];

  function setControlsState(currentId) {
    if (backBtn) {
      backBtn.classList.toggle("hidden", stack.length <= 1);
    }
    if (helpBtn) {
      helpBtn.classList.toggle("hidden", currentId !== homeId);
    }
  }

  function show(id) {
    screens.forEach((screen) => screen.classList.remove("active"));
    const target = document.getElementById(id) || document.getElementById(fallbackId);
    if (target) {
      target.classList.add("active");
      setControlsState(target.id);
    }
  }

  function push(id) {
    stack.push(id);
    show(id);
  }

  function pop() {
    if (stack.length > 1) {
      stack.pop();
    }
    show(stack[stack.length - 1]);
  }

  function current() {
    return stack[stack.length - 1];
  }

  function reset(id = homeId) {
    stack.length = 0;
    stack.push(id);
    show(id);
  }

  return {
    show,
    push,
    pop,
    current,
    reset,
  };
}
