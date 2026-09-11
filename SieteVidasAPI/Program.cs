using Infraestructura.Extensions;
using Microsoft.Extensions.Options;
using SieteVidasAPI.Configuration;
using SieteVidasAPI.Services;
using SieteVidasAPI.Security;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authentication.Cookies;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "sietevidas_session";
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

builder.Services.AddInfraestructura(builder.Configuration);

// Mercado Pago Point
builder.Services.Configure<MercadoPagoPointOptions>(
    builder.Configuration.GetSection(MercadoPagoPointOptions.SectionName));

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
