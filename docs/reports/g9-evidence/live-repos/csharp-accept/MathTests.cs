using Xunit;

namespace G9CsAccept;

public class MathTests
{
    [Fact]
    public void Mul_works()
    {
        Assert.Equal(12, MathOps.Mul(3, 4));
    }
}
