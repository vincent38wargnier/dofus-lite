export const createKeyframeAnimation = (path, CELL_SIZE) => {
  const totalSteps = path.length - 1;
  if (totalSteps === 0) return '';

  let keyframes = '';
  path.forEach((pos, index) => {
    const percentage = (index * 100) / totalSteps;
    keyframes += `
      ${percentage}% {
        transform: translate(${pos.x * CELL_SIZE}px, ${pos.y * CELL_SIZE}px);
      }
    `;
  });

  keyframes += `
    100% {
      transform: translate(${path[path.length - 1].x * CELL_SIZE}px, ${path[path.length - 1].y * CELL_SIZE}px);
    }
  `;

  return keyframes;
};

export const getAnimationStyle = (animationName, MOVEMENT_SPEED, pathLength) => ({
  animation: `${animationName} ${MOVEMENT_SPEED * (pathLength - 1)}ms linear forwards`
});