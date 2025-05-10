// Helper functions for vector and matrix calculations
// Note: This still requires glMatrix library to be loaded

/**
 * Ray-sphere intersection test
 * @param {vec3} origin - Ray origin point
 * @param {vec3} direction - Ray direction (normalized)
 * @param {Object} sphere - Sphere object with center and radius properties
 * @returns {number} - Distance to intersection or -1 if no intersection
 */
function intersectSphere(origin, direction, sphere) {
  // Calculate coefficients for quadratic equation
  const oc = vec3.create();
  vec3.subtract(oc, origin, sphere.center);

  const a = vec3.dot(direction, direction);
  const b = 2.0 * vec3.dot(oc, direction);
  const c = vec3.dot(oc, oc) - sphere.radius * sphere.radius;

  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return -1; // No intersection
  }

  // Calculate the nearest intersection point
  const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);

  if (t < 0) {
    return -1; // Intersection behind the ray origin
  }

  return t;
}

/**
 * Ray-plane intersection test
 * @param {vec3} origin - Ray origin point
 * @param {vec3} direction - Ray direction (normalized)
 * @param {Object} plane - Plane object with normal and point properties
 * @returns {number} - Distance to intersection or -1 if no intersection
 */
function intersectPlane(origin, direction, plane) {
  const denom = vec3.dot(direction, plane.normal);
  if (Math.abs(denom) < 0.0001) {
    return -1; // Ray is parallel to plane
  }

  const p0l0 = vec3.create();
  vec3.subtract(p0l0, plane.point, origin);
  const t = vec3.dot(p0l0, plane.normal) / denom;

  return t > 0 ? t : -1;
}

/**
 * Calculate surface normal at intersection point
 * @param {Object} object - The intersected object
 * @param {vec3} point - The intersection point
 * @returns {vec3} - The surface normal vector
 */
function calculateNormal(object, point) {
  const normal = vec3.create();

  if (object.type === "sphere") {
    // For sphere, normal is normalized vector from center to point
    vec3.subtract(normal, point, object.center);
    vec3.normalize(normal, normal);
  } else if (object.type === "plane") {
    // For plane, just return the plane's normal
    vec3.copy(normal, object.normal);
  }

  return normal;
}

/**
 * Check if a point is in shadow
 * @param {vec3} point - The point to check
 * @param {vec3} lightPos - Position of the light source
 * @param {Array} objects - Array of objects in the scene
 * @param {Object} currentObject - The object the point is on (to avoid self-shadowing)
 * @returns {boolean} - True if in shadow, false otherwise
 */
function isInShadow(point, lightPos, objects, currentObject) {
  // Calculate direction to light
  const lightDir = vec3.create();
  vec3.subtract(lightDir, lightPos, point);
  const lightDistance = vec3.length(lightDir);
  vec3.normalize(lightDir, lightDir);

  // Offset the start point slightly to avoid self-intersection
  const shadowOrigin = vec3.create();
  const offset = vec3.create();
  vec3.scale(offset, lightDir, 0.001);
  vec3.add(shadowOrigin, point, offset);

  // Check for intersection with any object
  for (const object of objects) {
    // Skip the current object to avoid self-shadowing
    if (object === currentObject) {
      continue;
    }

    let t = -1;
    if (object.type === "sphere") {
      t = intersectSphere(shadowOrigin, lightDir, object);
    } else if (object.type === "plane") {
      t = intersectPlane(shadowOrigin, lightDir, object);
    }

    // If an intersection is found and it's between the point and the light
    if (t > 0 && t < lightDistance) {
      return true; // Shadow ray hit something
    }
  }

  return false; // No shadow
}

/**
 * Calculate Phong lighting
 * @param {Object} intersection - Intersection information
 * @param {vec3} viewDir - View direction
 * @param {Array} lights - Array of light sources
 * @param {Array} objects - All objects in the scene (for shadow calculation)
 * @returns {Array} - RGB color values
 */
function calculatePhongLighting(intersection, viewDir, lights, objects) {
  const { point, normal, object } = intersection;
  const material = object.material;

  // Initialize result color
  const result = [0, 0, 0];

  // Add ambient light
  const ambient = vec3.scale(vec3.create(), object.color, material.ambient);
  vec3.add(result, result, ambient);

  for (const light of lights) {
    // Calculate light direction
    const lightDir = vec3.create();
    vec3.subtract(lightDir, light.position, point);
    vec3.normalize(lightDir, lightDir);

    // Check if the point is in shadow
    const inShadow = isInShadow(point, light.position, objects, object);

    // If in shadow, skip diffuse and specular calculations
    if (!inShadow) {
      // Calculate diffuse lighting
      const diffuseFactor = Math.max(0, vec3.dot(normal, lightDir));
      const diffuse = vec3.scale(
        vec3.create(),
        object.color,
        diffuseFactor * material.diffuse
      );

      // Calculate specular lighting
      const reflectDir = vec3.create();
      vec3.scale(reflectDir, normal, 2 * vec3.dot(normal, lightDir));
      vec3.subtract(reflectDir, reflectDir, lightDir);
      vec3.normalize(reflectDir, reflectDir);

      const specularFactor = Math.pow(
        Math.max(0, vec3.dot(reflectDir, viewDir)),
        material.shininess
      );
      const specular = vec3.scale(
        vec3.create(),
        [1, 1, 1],
        specularFactor * material.specular
      );

      // Add diffuse and specular components
      vec3.add(result, result, diffuse);
      vec3.add(result, result, specular);
    }
  }

  // Clamp values between 0 and 1
  return result.map((c) => Math.min(255, Math.max(0, Math.floor(c * 255))));
}

/**
 * Convert screen coordinates to normalized ray direction
 * @param {number} x - Screen x coordinate
 * @param {number} y - Screen y coordinate
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {vec3} - Normalized ray direction
 */
function getRayDirection(x, y, width, height) {
  // Convert pixel coordinates to normalized device coordinates (-1 to 1)
  const ndcX = (x / width) * 2 - 1;
  const ndcY = 1 - (y / height) * 2; // Flip Y to match OpenGL convention

  // Create ray direction (simple perspective projection)
  const rayDir = vec3.fromValues(ndcX, ndcY, 1);
  vec3.normalize(rayDir, rayDir);

  return rayDir;
}

/**
 * Find the closest intersection with any object in the scene
 * @param {vec3} origin - Ray origin point
 * @param {vec3} direction - Ray direction (normalized)
 * @param {Array} objects - Array of objects in the scene
 * @returns {Object|null} - Information about the closest intersection or null if none
 */
function findClosestIntersection(origin, direction, objects) {
  let closestT = Infinity;
  let closestObject = null;
  let intersectionPoint = null;
  let intersectionNormal = null;

  // Test intersection with each object
  for (const object of objects) {
    let t = -1;

    // Check object type and use appropriate intersection function
    if (object.type === "sphere") {
      t = intersectSphere(origin, direction, object);
    } else if (object.type === "plane") {
      t = intersectPlane(origin, direction, object);
    }

    // If we found a closer intersection, update our result
    if (t > 0 && t < closestT) {
      closestT = t;
      closestObject = object;

      // Calculate intersection point
      intersectionPoint = vec3.create();
      vec3.scaleAndAdd(intersectionPoint, origin, direction, t);

      // Calculate normal at intersection point
      intersectionNormal = calculateNormal(object, intersectionPoint);
    }
  }

  if (closestObject) {
    return {
      distance: closestT,
      object: closestObject,
      point: intersectionPoint,
      normal: intersectionNormal,
    };
  }

  return null;
}

/**
 * Calculate the intersection point of a ray
 * @param {vec3} origin - Ray origin
 * @param {vec3} direction - Ray direction
 * @param {number} t - Distance along the ray
 * @returns {vec3} - The intersection point
 */
function calculateIntersectionPoint(origin, direction, t) {
  const point = vec3.create();
  const scaledDir = vec3.create();

  vec3.scale(scaledDir, direction, t);
  vec3.add(point, origin, scaledDir);

  return point;
}
