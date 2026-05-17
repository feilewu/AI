FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt

COPY . .

RUN mkdir -p data

EXPOSE 8902

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8902"]
