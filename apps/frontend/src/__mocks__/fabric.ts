// fabric.js mock for tests
export const Canvas = jest.fn().mockImplementation(() => ({
  add: jest.fn(),
  remove: jest.fn(),
  clear: jest.fn(),
  toJSON: jest.fn().mockReturnValue({ objects: [] }),
  loadFromJSON: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  renderAll: jest.fn(),
  setActiveObject: jest.fn(),
  dispose: jest.fn(),
  getObjects: jest.fn().mockReturnValue([]),
}));

export const Textbox = jest.fn().mockImplementation((text: string, opts: object) => ({
  type: "textbox",
  text,
  ...opts,
  toObject: jest.fn().mockReturnValue({ type: "textbox", text, ...opts }),
}));

export const Rect = jest.fn().mockImplementation((opts: object) => ({
  type: "rect",
  ...opts,
  toObject: jest.fn().mockReturnValue({ type: "rect", ...opts }),
}));

export const Circle = jest.fn().mockImplementation((opts: object) => ({
  type: "circle",
  ...opts,
  toObject: jest.fn().mockReturnValue({ type: "circle", ...opts }),
}));

export const Line = jest.fn().mockImplementation((points: number[], opts: object) => ({
  type: "line",
  points,
  ...opts,
  toObject: jest.fn().mockReturnValue({ type: "line", points, ...opts }),
}));

export const FabricImage = {
  fromURL: jest.fn().mockResolvedValue({
    type: "image",
    toObject: jest.fn().mockReturnValue({ type: "image" }),
  }),
};
