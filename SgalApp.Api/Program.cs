using SgalApp.Infrastructure.Extensions;
using Microsoft.Extensions.Options;
using SgalApp.Api.Configuration;
using SgalApp.Api.Services;
using SgalApp.Api.Security;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "sgal_session";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromHours(12);
        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddInfrastructure(builder.Configuration);

// Data Protection: cifra las credenciales POS guardadas en la BD. La carpeta de llaves
// debe ser estable (montarla como volumen en producción) para que sobrevivan reinicios.
var dpKeysPath = builder.Configuration["DataProtection:KeysPath"];
if (string.IsNullOrWhiteSpace(dpKeysPath))
    dpKeysPath = Path.Combine(builder.Environment.ContentRootPath, "dp-keys");
Directory.CreateDirectory(dpKeysPath);
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(dpKeysPath))
    .SetApplicationName("SGAL");

// Mercado Pago Point
builder.Services.Configure<MercadoPagoPointOptions>(
    builder.Configuration.GetSection(MercadoPagoPointOptions.SectionName));

builder.Services.AddScoped<IPosCredentialProvider, PosCredentialProvider>();
builder.Services.AddScoped<ISaleLinesService, SaleLinesService>();
builder.Services.AddScoped<IPointSaleService, PointSaleService>();
builder.Services.AddScoped<ISaleVoidService, SaleVoidService>();
builder.Services.AddScoped<IPurchaseOrderExportService, PurchaseOrderExportService>();
builder.Services.AddScoped<IPermissionService, PermissionService>();

builder.Services.AddHttpClient<IPointService, PointService>((sp, client) =>
{
    var pointOptions = sp.GetRequiredService<IOptions<MercadoPagoPointOptions>>().Value;

    client.BaseAddress = new Uri(pointOptions.BaseUrl);
    client.Timeout = TimeSpan.FromSeconds(30);

    if (!string.IsNullOrWhiteSpace(pointOptions.AccessToken))
    {
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", pointOptions.AccessToken);
    }
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://localhost:3000")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.

app.UseCors("AllowReactApp");

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.Run();
