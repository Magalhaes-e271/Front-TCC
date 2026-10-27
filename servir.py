"""Servidor de desenvolvimento: arquivos do site e proxy para a API local."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import http.client
import json
from pathlib import Path

LIMITE = 12 * 1024 * 1024

class Handler(SimpleHTTPRequestHandler):
    api_port = 8080
    def erro(self, status, mensagem):
        body=json.dumps({'status':status,'message':mensagem},ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)));self.end_headers()
        if self.command!='HEAD':self.wfile.write(body)

    def proxy(self):
        if not self.path.startswith('/api/'):
            self.erro(405,'Método indisponível neste endereço.');return
        try:
            tamanho=int(self.headers.get('Content-Length','0'))
            if tamanho<0 or tamanho>LIMITE:self.erro(413,'Envio maior que 12 MB.');return
        except ValueError:self.erro(400,'Tamanho de envio inválido.');return
        if self.headers.get('Transfer-Encoding'):
            self.erro(400,'Envie o conteúdo com tamanho definido.');return
        body=self.rfile.read(tamanho) if tamanho else None
        headers={k:self.headers[k] for k in ['Authorization','Content-Type','Accept'] if k in self.headers}
        conexao=http.client.HTTPConnection('127.0.0.1',self.api_port,timeout=135)
        try:
            conexao.request(self.command,self.path[4:],body=body,headers=headers)
            resposta=conexao.getresponse();conteudo=resposta.read()
            self.send_response(resposta.status)
            for k in ['Content-Type','Content-Disposition','X-Content-Type-Options','Cache-Control','Pragma','Expires','Retry-After']:
                if resposta.getheader(k):self.send_header(k,resposta.getheader(k))
            self.send_header('Content-Length',str(len(conteudo)));self.end_headers()
            if self.command!='HEAD':self.wfile.write(conteudo)
        except (OSError,http.client.HTTPException):self.erro(502,'A API local ainda não está disponível. Inicie o servidor Java e tente novamente.')
        finally:conexao.close()

    def do_GET(self):
        if self.path.startswith('/api/'):self.proxy()
        else:super().do_GET()
    def do_HEAD(self):
        if self.path.startswith('/api/'):self.proxy()
        else:super().do_HEAD()
    do_POST=proxy
    do_PUT=proxy
    do_PATCH=proxy
    do_DELETE=proxy
    do_OPTIONS=proxy

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host',default='127.0.0.1')
    parser.add_argument('--port',type=int,default=8081)
    parser.add_argument('--api-port',type=int,default=8080)
    args=parser.parse_args()
    if any(p not in range(1,65536) for p in [args.port,args.api_port]):parser.error('Use portas entre 1 e 65535.')
    Handler.api_port=args.api_port
    handler=functools.partial(Handler,directory=str(Path(__file__).resolve().parent))
    with ThreadingHTTPServer((args.host,args.port),handler) as server:
        print(f'Site local: http://{args.host}:{args.port}',flush=True)
        try:server.serve_forever()
        except KeyboardInterrupt:pass

if __name__=='__main__':main()
