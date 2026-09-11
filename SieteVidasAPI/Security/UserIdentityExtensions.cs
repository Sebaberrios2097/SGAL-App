using System.Security.Claims;

namespace SieteVidasAPI.Security;

public static class UserIdentityExtensions
{
    public static int GetUserId(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;
}
