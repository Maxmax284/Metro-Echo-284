
describe("labels that have to fit next to each other", () => {
  it("keeps a minimum gap so two close entries don't print on top of each other", () => {
    const lefts = spreadMarkers([10, 11, 12], 600, 104);
    expect(lefts[1] - lefts[0]).toBeGreaterThanOrEqual(104);
    expect(lefts[2] - lefts[1]).toBeGreaterThanOrEqual(104);
  });

  it("leaves entries far apart exactly where the clock puts them", () => {
    expect(spreadMarkers([0, 50, 100], 600, 104)).toEqual([0, 300, 600]);
  });

  it("keeps the order it was given", () => {
    const lefts = spreadMarkers([5, 6, 40, 41], 600, 104);
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
  });

  it("gives the rail room for every label it holds", () => {
    expect(railWidthFor(4, 104)).toBeGreaterThanOrEqual(4 * 104);
    expect(railWidthFor(1, 104)).toBe(300);
  });
});
