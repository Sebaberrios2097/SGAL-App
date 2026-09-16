using System.Security.Claims;

namespace SgalApp.Api.Security;

public static class UserIdentityExtensions
{
    public static int GetUserId(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
}
