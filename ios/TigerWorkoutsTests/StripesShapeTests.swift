import SwiftUI
import Testing
@testable import TigerWorkouts

/// The in-app mark is drawn from the same numbers as Resources/AppIcon.svg, so the two match.
/// This pins the geometry: two bars, straight, where the SVG puts them.
@Suite("stripes")
struct StripesShapeTests {
    /// The rects of AppIcon.svg, as fractions of its 1024 canvas.
    private let svgBars = [
        CGRect(x: 225.0 / 1024, y: 164.0 / 1024, width: 225.0 / 1024, height: 696.0 / 1024),
        CGRect(x: 574.0 / 1024, y: 164.0 / 1024, width: 225.0 / 1024, height: 696.0 / 1024),
    ]

    /// Splits the path at each move into its subpaths' points. Core Graphics follows a closed rect
    /// with a lone move back to its corner, which draws nothing, so one-point runs are dropped.
    private func subpaths(of path: Path) -> [[CGPoint]] {
        var result: [[CGPoint]] = []
        path.forEach { element in
            switch element {
            case .move(let to): result.append([to])
            case .line(let to): result[result.count - 1].append(to)
            case .quadCurve(let to, _), .curve(let to, _, _): result[result.count - 1].append(to)
            case .closeSubpath: break
            }
        }
        return result.filter { $0.count > 2 }
    }

    @Test("two bars, each where the SVG puts it")
    func matchesTheIcon() {
        let box = CGRect(x: 0, y: 0, width: 100, height: 100)
        let bars = subpaths(of: StripesShape().path(in: box))
        #expect(bars.count == 2)
        for (points, svg) in zip(bars, svgBars) {
            let xs = points.map(\.x), ys = points.map(\.y)
            let bounds = CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
            let want = CGRect(x: svg.minX * 100, y: svg.minY * 100, width: svg.width * 100, height: svg.height * 100)
            #expect(abs(bounds.minX - want.minX) < 0.5)
            #expect(abs(bounds.minY - want.minY) < 0.5)
            #expect(abs(bounds.width - want.width) < 0.5)
            #expect(abs(bounds.height - want.height) < 0.5)
        }
    }

    @Test("the bars stand straight: top-left x equals bottom-left x")
    func noLean() {
        let box = CGRect(x: 0, y: 0, width: 100, height: 100)
        for points in subpaths(of: StripesShape().path(in: box)) {
            let top = points.min { ($0.y, $0.x) < ($1.y, $1.x) }!
            let bottom = points.min { ($0.y, -$0.x) > ($1.y, -$1.x) }!
            #expect(top.x == bottom.x)
        }
    }
}
