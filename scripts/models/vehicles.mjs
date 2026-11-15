import { Model } from "./geometry.mjs";

const TAU = Math.PI * 2;

function solarWing(model, x, y, z, columns, rows) {
  model.box([x, y - 0.065, z], [columns * 0.64 + 0.16, 0.12, rows * 0.85 + 0.16], 2);
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const cx = x + (c - (columns - 1) / 2) * 0.64;
      const cz = z + (r - (rows - 1) / 2) * 0.85;
      model.box([cx, y + 0.006, cz], [0.59, 0.025, 0.8], 5);
      model.box([cx, y + 0.02, cz], [0.012, 0.008, 0.78], 2);
    }
  }
}

function hatch(model, x, y, z, radius = 0.8, facing = 1) {
  model.lathe(
    [x, y, z],
    [x, y, z + facing],
    [
      [0, radius],
      [0.12, radius],
      [0.18, radius * 0.86],
    ],
    2,
  );
  model.cylinder([x, y, z + facing * 0.18], [x, y, z + facing * 0.205], radius * 0.83, 0);
  model.box([x, y, z + facing * 0.24], [radius * 0.5, 0.08, 0.07], 3);
  model.box([x, y, z + facing * 0.27], [0.07, radius * 0.5, 0.07], 2);
  for (let i = 0; i < 8; i++) {
    const angle = (TAU * i) / 8;
    const bx = x + Math.cos(angle) * radius * 0.91;
    const by = y + Math.sin(angle) * radius * 0.91;
    model.cylinder([bx, by, z + facing * 0.12], [bx, by, z + facing * 0.16], 0.035, 1, 8);
  }
}

function ladder(model, x, bottom, top, z, width = 0.55) {
  for (const side of [-1, 1])
    model.cylinder(
      [x + (side * width) / 2, bottom, z],
      [x + (side * width) / 2, top, z],
      0.035,
      2,
      8,
    );
  for (let y = bottom + 0.15; y < top; y += 0.28)
    model.cylinder([x - width / 2, y, z], [x + width / 2, y, z], 0.026, 2, 8);
}

function crate(model, x, y, z, width = 0.7) {
  model.box([x, y, z], [width, 0.55, 0.62], 0);
  for (const side of [-1, 1]) model.box([x + side * width * 0.32, y, z], [0.055, 0.57, 0.64], 1);
  model.box([x, y + 0.29, z], [0.23, 0.055, 0.14], 2);
}

export function buildHab() {
  const model = new Model("hab", "HAB — surface habitat");
  model.part("Raised deck and eight leveling feet", () => {
    model.ring(0.55, 4.5, 0.32, 1);
    model.ring(0.88, 4.46, 0.12, 2);
    for (let i = 0; i < 8; i++) {
      const angle = (TAU * (i + 0.5)) / 8;
      const x = Math.cos(angle) * 3.95;
      const z = Math.sin(angle) * 3.95;
      model.cylinder([x, 0.1, z], [x, 0.6, z], 0.12, 2);
      model.box([x, 0.06, z], [0.65, 0.12, 0.65], 1, angle);
    }
  });
  model.part("Ribbed pressure shell and segmented roof", () => {
    model.lathe(
      [0, 0.95, 0],
      [0, 1.95, 0],
      [
        [0, 4.25],
        [0.25, 4.4],
        [2.75, 4.4],
        [3.2, 4.1],
        [3.65, 3.1],
        [3.95, 1.1],
        [4, 0],
      ],
      0,
      64,
    );
    for (const y of [1.1, 1.45, 3.4, 3.75])
      model.ring(y, 4.43, 0.075, y === 1.45 ? 3 : 2, 0, 0, 64);
    for (let i = 0; i < 24; i++) {
      const angle = (TAU * i) / 24;
      const radial = (r, y) => [Math.cos(angle) * r, y, Math.sin(angle) * r];
      model.cylinder(radial(4.42, 1.02), radial(4.42, 3.65), 0.038, 2, 8);
      model.cylinder(radial(4.12, 4.16), radial(3.12, 4.61), 0.025, 2, 6);
      model.cylinder(radial(3.12, 4.61), radial(1.1, 4.91), 0.025, 2, 6);
    }
    model.ring(4.9, 0.62, 0.1, 1);
  });
  model.part("Forward airlock, pressure hatch and entry platform", () => {
    model.lathe(
      [0, 2.02, 3.9],
      [0, 2.02, 4.9],
      [
        [0, 1.18],
        [0.3, 1.28],
        [1.65, 1.28],
        [1.85, 1.08],
      ],
      0,
    );
    for (const z of [4.25, 4.65, 5.05, 5.45])
      model.cylinder([0, 2.02, z], [0, 2.02, z + 0.06], 1.31, 2);
    hatch(model, 0, 2.02, 5.76, 1.04);
    model.box([0, 0.94, 6.1], [2.1, 0.16, 2.1], 2);
    for (let i = 0; i < 4; i++)
      model.box([0, 0.12 + i * 0.22, 7.35 - i * 0.36], [1.4, 0.18, 0.38], 1);
    for (const side of [-1, 1]) {
      model.cylinder([side * 0.95, 1.05, 5.4], [side * 0.95, 1.95, 5.4], 0.03, 2, 8);
      model.cylinder([side * 0.95, 1.05, 6.9], [side * 0.95, 1.95, 6.9], 0.03, 2, 8);
      model.cylinder([side * 0.95, 1.95, 5.4], [side * 0.95, 1.95, 6.9], 0.03, 3, 8);
    }
  });
  model.part("Observation ports and service panels", () => {
    for (const angle of [0.3, 1.05, 2.1, 2.9, 3.9, 5.15]) {
      const axis = [Math.cos(angle), 0, Math.sin(angle)];
      const a = [axis[0] * 4.38, 2.68, axis[2] * 4.38];
      const b = [axis[0] * 4.51, 2.68, axis[2] * 4.51];
      model.cylinder(a, b, 0.38, 2);
      model.cylinder(b, [axis[0] * 4.53, 2.68, axis[2] * 4.53], 0.3, 4);
    }
    for (const x of [-2, 2]) {
      model.box([x, 1.64, -4.0], [1.25, 1.0, 0.7], 1);
      for (let i = 0; i < 7; i++) model.box([x, 1.27 + i * 0.12, -4.37], [1.08, 0.035, 0.06], 2);
    }
  });
  model.part("Paired solar wings and support trusses", () => {
    for (const side of [-1, 1]) {
      model.cylinder([side * 3.9, 1.5, -0.8], [side * 7.2, 1.5, -0.8], 0.08, 2);
      solarWing(model, side * 6.75, 1.62, -0.8, 5, 4);
      model.cylinder([side * 7.5, 0.08, -1.8], [side * 7.5, 1.5, -1.8], 0.07, 2);
      model.box([side * 7.5, 0.05, -1.8], [0.5, 0.1, 0.5], 1);
    }
  });
  model.part("Communications mast, dish and roof equipment", () => {
    model.cylinder([-1.5, 4.65, -0.7], [-1.5, 6.25, -0.7], 0.045, 2, 12);
    model.cylinder([-1.85, 5.95, -0.7], [-1.15, 5.95, -0.7], 0.018, 2, 8);
    model.lathe(
      [1.5, 4.65, -0.8],
      [1.5, 5.65, -0.4],
      [
        [0, 0.16],
        [0.2, 0.3],
        [0.4, 0.72],
        [0.44, 0.72],
      ],
      0,
    );
    model.cylinder([1.5, 5.02, -0.65], [1.5, 5.58, -0.43], 0.03, 2, 8);
    crate(model, 2.6, 0.35, 5.2);
    crate(model, 3.4, 0.35, 5.2);
  });
  return model.ground();
}

export function buildRover() {
  const model = new Model("rover", "Rover — pressurized surface transport");
  model.part("Six wheels, hubs, tread blocks and suspension", () => {
    for (const x of [-1.82, 1.82]) {
      for (const z of [-2.2, 0, 2.2]) {
        const sign = Math.sign(x);
        model.lathe(
          [x - sign * 0.28, 0.865, z],
          [x + sign, 0.865, z],
          [
            [0, 0.64],
            [0.1, 0.79],
            [0.51, 0.79],
            [0.62, 0.64],
          ],
          6,
          32,
        );
        model.cylinder([x + sign * 0.36, 0.865, z], [x + sign * 0.39, 0.865, z], 0.44, 2);
        model.cylinder([x + sign * 0.4, 0.865, z], [x + sign * 0.46, 0.865, z], 0.17, 3, 16);
        for (let i = 0; i < 24; i++) {
          const angle = (TAU * i) / 24;
          const cy = 0.865 + Math.sin(angle) * 0.815;
          const cz = z + Math.cos(angle) * 0.815;
          model.cylinder([x - sign * 0.15, cy, cz], [x + sign * 0.23, cy, cz], 0.045, 1, 6);
        }
        model.cylinder([sign * 1.2, 1.35, z - 0.35], [x, 0.865, z], 0.09, 2, 12);
        model.cylinder([sign * 1.2, 1.35, z + 0.45], [x, 0.865, z], 0.09, 2, 12);
        model.cylinder([sign * 1.35, 1.65, z], [x, 0.9, z], 0.08, 3, 12);
      }
    }
  });
  model.part("Chassis, pressure cabin and bumpers", () => {
    model.box([0, 1.12, 0], [2.9, 0.46, 6.5], 1);
    model.extrude(
      [
        [-1.45, 1.37],
        [1.45, 1.37],
        [1.45, 2.8],
        [1.05, 3.45],
        [-1.05, 3.45],
        [-1.45, 2.8],
      ],
      -2.85,
      2.95,
      0,
    );
    for (const side of [-1, 1]) {
      model.box([side * 1.47, 1.6, 0], [0.12, 0.18, 5.5], 3);
      model.box([side * 1.49, 2.02, -0.55], [0.08, 0.05, 2.6], 2);
    }
    for (const z of [-3.15, 3.18]) model.box([0, 1.12, z], [3.35, 0.2, 0.2], 2);
    hatch(model, 0, 2.1, -3.08, 0.69, -1);
  });
  model.part("Segmented forward windshield and cabin glazing", () => {
    model.extrude(
      [
        [-1.22, 2.2],
        [1.22, 2.2],
        [1.22, 2.73],
        [0.89, 3.25],
        [-0.89, 3.25],
        [-1.22, 2.73],
      ],
      2.95,
      2.99,
      1,
    );
    model.extrude(
      [
        [-1.12, 2.3],
        [-0.06, 2.3],
        [-0.06, 3.14],
        [-0.83, 3.14],
        [-1.12, 2.7],
      ],
      2.995,
      3.008,
      4,
    );
    model.extrude(
      [
        [0.06, 2.3],
        [1.12, 2.3],
        [1.12, 2.7],
        [0.83, 3.14],
        [0.06, 3.14],
      ],
      2.995,
      3.008,
      4,
    );
    for (const side of [-1, 1]) {
      for (const z of [1.75, 0.3]) {
        model.box([side * 1.466, 2.56, z], [0.04, 0.64, 1.12], 1);
        model.box([side * 1.49, 2.57, z], [0.025, 0.51, 0.97], 4);
      }
      model.box([side * 1.07, 1.9, 3.01], [0.38, 0.15, 0.12], 8);
      model.box([side * 1.53, 3.01, 2.0], [0.24, 0.16, 0.33], 2);
      model.cylinder([side * 1.3, 2.7, 2.1], [side * 1.6, 3.0, 2.0], 0.025, 2, 8);
    }
  });
  model.part("Roof rack, folded power array and communications", () => {
    for (const x of [-0.85, 0.85]) model.cylinder([x, 3.49, -2.6], [x, 3.49, 1.65], 0.045, 2, 8);
    solarWing(model, 0, 3.58, -0.65, 3, 3);
    model.cylinder([0.9, 3.37, -2.45], [0.9, 4.42, -2.45], 0.025, 2, 8);
    model.box([0.9, 4.44, -2.45], [0.25, 0.12, 0.16], 1);
    model.box([0, 3.62, 2.3], [1.3, 0.13, 0.18], 1);
    for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) model.box([x, 3.62, 2.41], [0.17, 0.09, 0.06], 8);
  });
  model.part("Rear utility tanks, access steps and cargo", () => {
    for (const side of [-1, 1]) {
      const x = side * 1.12;
      model.lathe(
        [x, 1.8, -3.1],
        [x, 2.8, -3.1],
        [
          [0, 0.12],
          [0.1, 0.24],
          [0.9, 0.24],
          [1.04, 0.12],
        ],
        7,
        16,
      );
      for (const y of [2.05, 2.52]) model.ring(y, 0.26, 0.06, 1, x, -3.1, 16);
    }
    ladder(model, 0, 0.28, 1.75, -3.18);
    crate(model, -0.6, 3.77, -2.18, 0.72);
    crate(model, 0.25, 3.77, -2.18, 0.6);
  });
  return model.ground();
}

export function buildMav() {
  const model = new Model("mav", "MAV — Mars ascent vehicle");
  model.part("Ascent stage pressure hull, avionics and nose", () => {
    model.lathe(
      [0, 2.4, 0],
      [0, 3.4, 0],
      [
        [0, 1.46],
        [0.4, 1.6],
        [5.2, 1.6],
        [5.5, 1.46],
        [7.0, 1.46],
        [7.7, 1.1],
        [8.35, 0.55],
        [8.7, 0.1],
        [8.74, 0],
      ],
      0,
      48,
    );
    for (const y of [2.75, 3.2, 6.8, 7.65, 8.05, 9.35])
      model.ring(y, y > 7.8 ? 1.49 : 1.63, 0.1, y === 7.65 ? 3 : 2);
    for (let i = 0; i < 12; i++) {
      const a = (TAU * i) / 12;
      model.cylinder(
        [Math.cos(a) * 1.615, 3.35, Math.sin(a) * 1.615],
        [Math.cos(a) * 1.615, 6.65, Math.sin(a) * 1.615],
        0.023,
        2,
        6,
      );
    }
    hatch(model, 0, 8.62, 1.46, 0.57);
    for (const side of [-1, 1]) {
      model.box([side * 0.6, 9.47, 1.34], [0.62, 0.41, 0.08], 1, side * 0.42);
      model.box([side * 0.61, 9.47, 1.39], [0.5, 0.29, 0.04], 4, side * 0.42);
    }
    model.cylinder([0, 11.1, 0], [0, 11.8, 0], 0.025, 2, 8);
  });
  model.part("Four external propellant tanks and plumbing", () => {
    for (let i = 0; i < 4; i++) {
      const a = (TAU * (i + 0.5)) / 4;
      const x = Math.cos(a) * 1.82;
      const z = Math.sin(a) * 1.82;
      model.lathe(
        [x, 2.65, z],
        [x, 3.65, z],
        [
          [0, 0.18],
          [0.3, 0.55],
          [2.9, 0.55],
          [3.2, 0.18],
        ],
        7,
        24,
      );
      for (const y of [3.15, 5.22]) model.ring(y, 0.57, 0.1, 1, x, z, 24);
      model.cylinder([x, 2.7, z], [x * 0.65, 2.15, z * 0.65], 0.055, 2, 8);
    }
  });
  model.part("Engine deck, four expansion bells and heat shield", () => {
    model.ring(2.05, 1.9, 0.35, 1);
    for (const x of [-0.72, 0.72]) {
      for (const z of [-0.72, 0.72]) {
        model.lathe(
          [x, 1.1, z],
          [x, 2.1, z],
          [
            [0, 0.53],
            [0.07, 0.55],
            [0.28, 0.38],
            [0.65, 0.19],
            [0.95, 0.18],
          ],
          2,
          24,
        );
        model.cylinder([x, 1.085, z], [x, 1.095, z], 0.47, 1, 24);
      }
    }
  });
  model.part("Four splayed landing legs with shock struts and pads", () => {
    for (let i = 0; i < 4; i++) {
      const angle = (TAU * i) / 4 + Math.PI / 4;
      const p = (r, y, offset = 0) => [
        Math.cos(angle + offset) * r,
        y,
        Math.sin(angle + offset) * r,
      ];
      model.cylinder(p(1.65, 3.25), p(3.5, 0.27), 0.11, 2, 12);
      model.cylinder(p(1.5, 2.12, 0.36), p(3.5, 0.32), 0.07, 0, 12);
      model.cylinder(p(1.5, 2.12, -0.36), p(3.5, 0.32), 0.07, 0, 12);
      model.cylinder(p(2.45, 1.92), p(3.0, 1.07), 0.17, 3, 12);
      const foot = p(3.5, 0);
      model.lathe(
        [foot[0], 0, foot[2]],
        [foot[0], 1, foot[2]],
        [
          [0, 0.59],
          [0.09, 0.64],
          [0.16, 0.52],
          [0.22, 0.2],
        ],
        1,
        16,
      );
    }
  });
  model.part("External access ladder, service deck and attitude thrusters", () => {
    model.box([0, 7.95, 1.86], [1.35, 0.13, 1.2], 2);
    ladder(model, 0, 0.28, 8.08, 2.02, 0.62);
    for (const side of [-1, 1]) {
      model.cylinder([side * 0.57, 8.0, 1.8], [side * 0.57, 8.65, 1.8], 0.03, 3, 8);
      model.box([side * 1.52, 8.7, -0.25], [0.35, 0.32, 0.5], 1);
      model.cylinder([side * 1.68, 8.7, -0.4], [side * 1.88, 8.7, -0.4], 0.09, 2, 12);
    }
  });
  return model.ground();
}
