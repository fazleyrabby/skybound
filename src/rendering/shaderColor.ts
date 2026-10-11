/**
 * For hand-written fragment shaders. Their colours are authored the way they
 * should appear on screen, but the frame is composed in linear light and
 * converted for the display at the very end, so they must be converted the
 * other way first. Declare this in the shader and wrap the final colour in it.
 */
export const TO_LINEAR = /* glsl */ `
  vec3 toLinear(vec3 displayed) {
    return pow(max(displayed, vec3(0.0)), vec3(2.2));
  }
`;
